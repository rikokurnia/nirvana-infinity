// Mock USDC faucet — server-only.
//
// The faucet keypair (mint authority + fee payer) lives in MOCK_USDC_FAUCET_SECRET,
// a server-only env var that NEVER ships to the browser. The "Get test USDC"
// button POSTs a wallet address here; we mint test mUSDC to that wallet so
// anyone — founder or worker — can fund themselves without a wallet popup.

import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

// spl-token / web3.js need Node APIs — not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const MINT_ADDRESS =
  process.env.MOCK_USDC_MINT ?? process.env.NEXT_PUBLIC_MOCK_USDC_MINT;
const FAUCET_SECRET = process.env.MOCK_USDC_FAUCET_SECRET;

// 1,000 mUSDC per request (6 decimals) = 1,000,000,000 base units.
const FAUCET_AMOUNT = 1_000 * 1_000_000;

export async function POST(request: Request) {
  if (!MINT_ADDRESS || !FAUCET_SECRET) {
    return Response.json(
      {
        error:
          "Faucet not configured. Set NEXT_PUBLIC_MOCK_USDC_MINT and MOCK_USDC_FAUCET_SECRET (run scripts/create-mock-usdc.mjs).",
      },
      { status: 500 }
    );
  }

  let owner: PublicKey;
  try {
    const { address } = await request.json();
    owner = new PublicKey(address);
  } catch {
    return Response.json(
      { error: "Provide a valid Solana wallet `address`." },
      { status: 400 }
    );
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const faucet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(FAUCET_SECRET))
    );
    const mint = new PublicKey(MINT_ADDRESS);

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
      FAUCET_AMOUNT
    );

    return Response.json({
      signature,
      ata: ata.address.toBase58(),
      amount: "1000",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
