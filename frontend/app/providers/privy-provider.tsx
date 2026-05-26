"use client";

import { createContext, useContext } from "react";
import {
  PrivyProvider as PrivyProviderBase,
  usePrivy,
  type User,
} from "@privy-io/react-auth";

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
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </PrivyProviderBase>
  );
}
