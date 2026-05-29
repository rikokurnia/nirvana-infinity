# Nirvana Protocol — Frontend

Next.js 15 App Router frontend for the [Nirvana Protocol](https://github.com/soraonchain-byte/Nirvana) equity-streaming smart contract on Solana.

**Live:** https://nirvana-infinity.vercel.app  
**Program ID (Devnet):** `FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc`

---

## Setup

```bash
cp .env.example .env.local
# Fill in:
#   NEXT_PUBLIC_PRIVY_APP_ID=...
#   NEXT_PUBLIC_PRIVY_APP_SECRET=...   (server-only, never NEXT_PUBLIC_)
#   NEXT_PUBLIC_MOCK_USDC_MINT=HtehiG3kcVY4zdBZHcGtSex4FpYBqFRN8HfYquiyFL8c
#   MOCK_USDC_FAUCET_SECRET=...        (server-only mint authority keypair)
#   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

npm install
npm run dev
```

Open http://localhost:3000.

---

## Key Files

| File | Purpose |
|---|---|
| `lib/anchor.ts` | All Anchor instruction wrappers, PDA derivations |
| `lib/idl.json` | Copied from `target/idl/nirvana_protocol.json` after each build |
| `lib/types.ts` | `DistributionState` TypeScript interface |
| `lib/stream-calculator.ts` | Preset split logic (linear/milestone/cliff %) |
| `lib/utils.ts` | `calculateClaimable`, `formatTokenAmount`, etc. |
| `hooks/use-streams.ts` | React hook — fetches streams, exposes action handlers |
| `app/api/faucet/route.ts` | Server-side mUSDC mint endpoint |
| `app/dashboard/founder/` | Create, manage, cancel streams |
| `app/dashboard/worker/` | View and withdraw from incoming streams |

---

## Architecture Notes

- **Wallet:** Privy `walletChainType: "solana-only"` + `toSolanaWalletConnectors()` for Phantom/Solflare
- **PDA seeds:** `[b"state", authority, recipient, nonce_le8]` — nonce defaults to `Date.now()` so same founder→recipient pair never collides
- **Token decimals:** fetched live per mint via `getMint` so any SPL token renders correctly
- **History:** stored in `localStorage` keyed by wallet address — no backend required
