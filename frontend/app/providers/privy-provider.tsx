"use client";

import { createContext, useContext } from "react";
import {
  PrivyProvider as PrivyProviderBase,
  usePrivy,
  type User,
} from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
// http(s) -> ws(s) for the subscriptions endpoint.
const WS_URL = RPC_URL.replace(/^http/, "ws");

// Registers Phantom/Solflare under the Solana Wallet Standard instead of letting
// Privy fall back to EIP-1193 (which is why Phantom was being asked for ETH).
const solanaConnectors = toSolanaWalletConnectors();

interface AuthContextValue {
  authenticated: boolean;
  ready: boolean;
  user: User | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  authenticated: false,
  ready: false,
  user: null,
  login: () => {},
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

function AuthBridge({ children }: { children: React.ReactNode }) {
  const { login, logout, authenticated, ready, user } = usePrivy();
  return (
    <AuthContext.Provider
      value={{ login, logout, authenticated, ready, user }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProviderBase
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#2FF3C8",
          // Tell Privy to only ask wallets for their Solana chain — otherwise
          // Phantom gets asked for Ethereum (EIP-1193), which is the bug.
          walletChainType: "solana-only",
        },
        // Register Phantom (and other Solana wallets) via Wallet Standard so
        // Privy can actually talk to them on Solana.
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        // Route Privy's own Solana calls through the dedicated RPC, not the
        // rate-limited public devnet endpoint.
        solana: {
          rpcs: {
            "solana:devnet": {
              rpc: createSolanaRpc(RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(WS_URL),
            },
            // Privy's embedded Solana wallet defaults to the mainnet chain and
            // simulates/prepares txs against whatever RPC is configured here.
            // This app is devnet-only, so point mainnet at the SAME devnet RPC —
            // otherwise Privy prepares on real mainnet and the devnet-built tx
            // 403s / fails. lib/anchor.ts still broadcasts on devnet.
            "solana:mainnet": {
              rpc: createSolanaRpc(RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(WS_URL),
            },
          },
        },
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </PrivyProviderBase>
  );
}
