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
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { MOCK_TOKENS, getMockToken } from "@/lib/tokens";

// Privy embedded wallets start with 0 devnet SOL, so users can faucet tokens
// but still can't pay fees/rent to create or claim a stream — they hit
// "Attempt to debit an account but found no record of a prior credit". The
// faucet keypair tops them up with a little gas SOL whenever they're low.
const GAS_MIN_LAMPORTS = 0.015 * LAMPORTS_PER_SOL; // top up below this
const GAS_DRIP_LAMPORTS = 0.02 * LAMPORTS_PER_SOL; // amount to send

/** Send a little SOL for gas if `owner` is low. Best-effort — returns the
 *  signature, or null on skip/failure (never blocks the token mint). */
async function dripGas(
  connection: Connection,
  faucet: Keypair,
  owner: PublicKey
): Promise<string | null> {
  try {
    const balance = await connection.getBalance(owner);
    if (balance >= GAS_MIN_LAMPORTS) return null; // already has gas
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucet.publicKey,
        toPubkey: owner,
        lamports: GAS_DRIP_LAMPORTS,
      })
    );
    return await sendAndConfirmTransaction(connection, tx, [faucet]);
  } catch (err) {
    console.warn("faucet gas drip failed", err);
    return null;
  }
}

// spl-token / web3.js need Node APIs — not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const FAUCET_SECRET = process.env.MOCK_USDC_FAUCET_SECRET;

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
  try {
    const body = await request.json();
    owner = new PublicKey(body.address);
    requestedMint = body.mint;
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

    // Top up gas SOL first so the wallet can actually pay for create/claim.
    const gasSignature = await dripGas(connection, faucet, owner);

    // Faucet pays rent to open the recipient's ATA if it doesn't exist yet.
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      faucet,
      mint,
      owner
    );

    const signature = await mintTo(
      connection,
      faucet, // fee payer
      mint,
      ata.address,
      faucet, // mint authority
      amount
    );

    return Response.json({
      signature,
      gasSignature,
      ata: ata.address.toBase58(),
      symbol: token.symbol,
      amount: String(token.faucetAmount),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
