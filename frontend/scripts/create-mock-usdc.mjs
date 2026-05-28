// One-time setup: create the shared "mock USDC" SPL mint on devnet.
//
// The mint authority is a dedicated FAUCET keypair (also the fee payer). Its
// secret never ships to the browser — it lives in a server-only env var and is
// used by app/api/faucet/route.ts to mint test tokens to anyone who asks.
//
//   node scripts/create-mock-usdc.mjs
//
// Re-run safely: pass MOCK_USDC_FAUCET_SECRET in the env to reuse an existing
// faucet keypair instead of generating a new one.

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createMint } from "@solana/spl-token";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const DECIMALS = 6; // match real USDC

const connection = new Connection(RPC_URL, "confirmed");

// Reuse an existing faucet keypair if one was supplied, else make a fresh one.
const faucet = process.env.MOCK_USDC_FAUCET_SECRET
  ? Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.MOCK_USDC_FAUCET_SECRET))
    )
  : Keypair.generate();

console.log("Faucet (mint authority + fee payer):", faucet.publicKey.toBase58());

// The faucet pays rent + fees, so it needs a little devnet SOL.
async function ensureFunded() {
  const bal = await connection.getBalance(faucet.publicKey);
  if (bal >= 0.05 * LAMPORTS_PER_SOL) {
    console.log("Faucet balance OK:", bal / LAMPORTS_PER_SOL, "SOL");
    return;
  }
  console.log("Airdropping 1 SOL to the faucet…");
  try {
    const sig = await connection.requestAirdrop(
      faucet.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    console.log("Airdrop confirmed.");
  } catch (err) {
    console.error("\nAirdrop failed (devnet faucets rate-limit hard).");
    console.error(
      "Send ~0.1 devnet SOL to the faucet address above (e.g. https://faucet.solana.com),"
    );
    console.error(
      "then re-run with MOCK_USDC_FAUCET_SECRET set to reuse this keypair:\n"
    );
    console.error(
      `  MOCK_USDC_FAUCET_SECRET='${JSON.stringify([...faucet.secretKey])}' node scripts/create-mock-usdc.mjs\n`
    );
    process.exit(1);
  }
}

async function main() {
  await ensureFunded();

  console.log("Creating mock USDC mint…");
  const mint = await createMint(
    connection,
    faucet, // payer
    faucet.publicKey, // mint authority
    null, // freeze authority (none)
    DECIMALS
  );

  console.log("\n✅ Done. Add these to frontend/.env (and Vercel env):\n");
  console.log(`NEXT_PUBLIC_MOCK_USDC_MINT=${mint.toBase58()}`);
  console.log(
    `MOCK_USDC_FAUCET_SECRET=${JSON.stringify([...faucet.secretKey])}`
  );
  console.log(
    "\n⚠️  MOCK_USDC_FAUCET_SECRET is server-only — NEVER prefix it with NEXT_PUBLIC_."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
