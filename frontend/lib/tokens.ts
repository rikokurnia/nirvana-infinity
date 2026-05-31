// Single source of truth for the devnet **mock** tokens this app streams.
//
// The on-chain program transfers SPL tokens, so every streamable token must be a
// real SPL mint the founder can actually hold a balance of. On devnet there's no
// faucet for real USDC/BONK and native SOL can't be streamed without wrapping —
// so we mint our own mock SPL tokens (all owned by the faucet keypair) and let
// anyone fund themselves from /api/faucet. Mint addresses come from env so they
// can be regenerated without code changes (see scripts/create-mock-mints.mjs).
//
// Decimals mirror the real tokens so amounts/labels look authentic; the on-chain
// math reads decimals live per-mint (see lib/anchor.ts fetchStreamsFor), so these
// values only drive the faucet + display.

export interface MockToken {
  symbol: string;
  mint: string; // base58 mint address
  decimals: number;
  /** Amount minted per faucet click, in UI units. */
  faucetAmount: number;
}

// NEXT_PUBLIC_* are inlined at build, so reference them statically (not via a
// computed key) or Next can't replace them in the client bundle.
const CATALOG: Array<Omit<MockToken, "mint"> & { mint: string | undefined }> = [
  {
    symbol: "mUSDC",
    mint: process.env.NEXT_PUBLIC_MOCK_USDC_MINT,
    decimals: 6,
    faucetAmount: 1_000,
  },
  {
    symbol: "mSOL",
    mint: process.env.NEXT_PUBLIC_MOCK_SOL_MINT,
    decimals: 9,
    faucetAmount: 100,
  },
  {
    symbol: "mBONK",
    mint: process.env.NEXT_PUBLIC_MOCK_BONK_MINT,
    decimals: 5,
    faucetAmount: 1_000_000,
  },
  {
    symbol: "mUSDT",
    mint: process.env.NEXT_PUBLIC_MOCK_USDT_MINT,
    decimals: 6,
    faucetAmount: 1_000,
  },
];

/** Configured mock tokens (only those with a mint address set in env). */
export const MOCK_TOKENS: MockToken[] = CATALOG.filter(
  (t): t is MockToken => Boolean(t.mint)
);

export function getMockToken(mint: string): MockToken | undefined {
  return MOCK_TOKENS.find((t) => t.mint === mint);
}

/** Symbol lookup keyed by mint, for labeling streams in the dashboards. */
export const MOCK_TOKEN_SYMBOLS: Record<string, string> = Object.fromEntries(
  MOCK_TOKENS.map((t) => [t.mint, t.symbol])
);
