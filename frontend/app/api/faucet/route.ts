// Mock SPL token faucet — server-only.
//
// The faucet keypair (mint authority + fee payer) lives in MOCK_USDC_FAUCET_SECRET,
// a server-only env var that NEVER ships to the browser. The same keypair is the
// mint authority for every mock token (mUSDC/mSOL/mBONK/mUSDT). A client POSTs a
// wallet address + the mint it wants; we mint that token to the wallet so anyone —
// founder or worker — can fund themselves without a wallet popup.
//
// SECURITY: we only ever mint mints in the MOCK_TOKENS allowlist, never an
// arbitrary mint supplied by the caller.

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { MOCK_TOKENS, getMockToken } from "@/lib/tokens";

// spl-token / web3.js need Node APIs — not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const FAUCET_SECRET = process.env.MOCK_USDC_FAUCET_SECRET;

// Privy embedded wallets start with 0 devnet SOL, so users can faucet tokens
// but still can't pay fees/rent to create or claim a stream — they hit
// "Attempt to debit an account but found no record of a prior credit". The
// faucet tops them up with a little gas SOL whenever they're low.
const GAS_MIN_LAMPORTS = 0.015 * LAMPORTS_PER_SOL; // top up below this
const GAS_DRIP_LAMPORTS = 0.02 * LAMPORTS_PER_SOL; // amount to send

/** Did this RPC error mean the transaction's blockhash expired before it
 *  landed? Devnet is slow/congested, so this is the common faucet failure
 *  ("block height exceeded" / "Signature has expired"). */
function isBlockhashExpired(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err);
  return /block height exceeded|blockhash|signature.*expired|expired/i.test(msg);
}

/** Send a transaction and wait for confirmation, retrying with a *fresh*
 *  blockhash when the previous one expires. This is what makes the faucet
 *  survive slow devnet instead of spinning forever / failing. */
async function sendWithRetry(
  connection: Connection,
  instructions: TransactionInstruction[],
  feePayer: Keypair,
  attempts = 3
): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({
      feePayer: feePayer.publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(...instructions);
    tx.sign(feePayer);
    try {
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 5,
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      return signature;
    } catch (err) {
      lastErr = err;
      // Only a fresh blockhash can recover an expiry; anything else is fatal.
      if (!isBlockhashExpired(err)) throw err;
    }
  }
  throw lastErr;
}

export async function POST(request: Request) {
  if (!FAUCET_SECRET || MOCK_TOKENS.length === 0) {
    return Response.json(
      {
        error:
          "Faucet not configured. Set MOCK_USDC_FAUCET_SECRET and the NEXT_PUBLIC_MOCK_*_MINT vars (run scripts/create-mock-mints.mjs).",
      },
      { status: 500 }
    );
  }

  let owner: PublicKey;
  let requestedMint: string | undefined;
  let gasOnly = false;
  try {
    const body = await request.json();
    owner = new PublicKey(body.address);
    requestedMint = body.mint;
    // Workers don't need mock tokens (they receive them via the stream) — they
    // only need gas SOL to sign a withdraw. `gasOnly` drips SOL and skips minting.
    gasOnly = body.gasOnly === true;
  } catch {
    return Response.json(
      { error: "Provide a valid Solana wallet `address`." },
      { status: 400 }
    );
  }

  // Default to the first configured token (mUSDC) when no mint is specified, so
  // older callers keep working. Only allowlisted mints are ever minted.
  const token = requestedMint ? getMockToken(requestedMint) : MOCK_TOKENS[0];
  if (!token) {
    return Response.json(
      { error: "Unknown or unsupported token mint." },
      { status: 400 }
    );
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const faucet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(FAUCET_SECRET))
    );
    const mint = new PublicKey(token.mint);
    const amount = BigInt(Math.round(token.faucetAmount * 10 ** token.decimals));
    const ata = getAssociatedTokenAddressSync(mint, owner);

    // Build everything into ONE transaction so it's a single confirmation:
    //   (1) create the recipient ATA (idempotent), (2) mint tokens, (3) gas drip.
    // The faucet keypair is fee payer + mint authority + gas source for all.
    // gasOnly skips (1) and (2) — just the SOL drip.
    const ownerLamports = await connection.getBalance(owner);

    const instructions: TransactionInstruction[] = [];
    if (!gasOnly) {
      // Idempotent create: no-op if the ATA already exists, so we never hit
      // "Provided owner is not allowed" from a non-idempotent Create on a
      // wallet that was already fauceted.
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          faucet.publicKey, // payer
          ata,
          owner,
          mint
        )
      );
      instructions.push(
        createMintToInstruction(mint, ata, faucet.publicKey, amount)
      );
    }
    const needsGas = ownerLamports < GAS_MIN_LAMPORTS;
    if (needsGas) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: faucet.publicKey,
          toPubkey: owner,
          lamports: GAS_DRIP_LAMPORTS,
        })
      );
    }

    // gasOnly + already funded → nothing to do (don't send an empty tx).
    if (instructions.length === 0) {
      return Response.json({ signature: null, gasIncluded: false, alreadyFunded: true });
    }

    const signature = await sendWithRetry(connection, instructions, faucet);

    return Response.json({
      signature,
      gasIncluded: needsGas,
      ata: gasOnly ? null : ata.toBase58(),
      symbol: gasOnly ? null : token.symbol,
      amount: gasOnly ? null : String(token.faucetAmount),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
