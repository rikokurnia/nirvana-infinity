// One-time setup: create the mock SPL mints this app streams on devnet.
//
// Reuses the faucet keypair (MOCK_USDC_FAUCET_SECRET) as the mint authority for
// every mock token, so /api/faucet can mint all of them with the same secret.
// mUSDC already exists (NEXT_PUBLIC_MOCK_USDC_MINT) and is skipped.
//
// Usage:
//   node --env-file=.env scripts/create-mock-mints.mjs
// Then paste the printed NEXT_PUBLIC_MOCK_*_MINT lines into .env.

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const FAUCET_SECRET = process.env.MOCK_USDC_FAUCET_SECRET;

if (!FAUCET_SECRET) {
  console.error("Missing MOCK_USDC_FAUCET_SECRET. Run with: node --env-file=.env scripts/create-mock-mints.mjs");
  process.exit(1);
}

// Tokens to create. mUSDC is intentionally omitted — it already exists.
const TOKENS = [
  { symbol: "mSOL", env: "NEXT_PUBLIC_MOCK_SOL_MINT", decimals: 9 },
  { symbol: "mBONK", env: "NEXT_PUBLIC_MOCK_BONK_MINT", decimals: 5 },
  { symbol: "mUSDT", env: "NEXT_PUBLIC_MOCK_USDT_MINT", decimals: 6 },
];

const connection = new Connection(RPC_URL, "confirmed");
const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(FAUCET_SECRET)));

console.log("Faucet (mint authority):", faucet.publicKey.toBase58());

let balance = await connection.getBalance(faucet.publicKey);
console.log("Faucet SOL balance:", balance / LAMPORTS_PER_SOL);
if (balance < 0.05 * LAMPORTS_PER_SOL) {
  console.log("Low balance, requesting devnet airdrop…");
  try {
    const sig = await connection.requestAirdrop(faucet.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    balance = await connection.getBalance(faucet.publicKey);
    console.log("New balance:", balance / LAMPORTS_PER_SOL);
  } catch (e) {
    console.warn("Airdrop failed (rate limit?). Fund the faucet manually if mint creation fails:", e.message);
  }
}

const out = [];
for (const t of TOKENS) {
  const existing = process.env[t.env];
  if (existing) {
    console.log(`${t.symbol}: already set (${existing}), skipping.`);
    out.push(`${t.env}=${existing}`);
    continue;
  }
  const mint = await createMint(
    connection,
    faucet, // payer
    faucet.publicKey, // mint authority
    null, // no freeze authority
    t.decimals
  );
  console.log(`${t.symbol} (${t.decimals} dp): ${mint.toBase58()}`);
  out.push(`${t.env}=${mint.toBase58()}`);
}

console.log("\n--- paste into .env ---");
console.log(out.join("\n"));
