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

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { MOCK_TOKENS, getMockToken } from "@/lib/tokens";

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
      ata: ata.address.toBase58(),
      symbol: token.symbol,
      amount: String(token.faucetAmount),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
