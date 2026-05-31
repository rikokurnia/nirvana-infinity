"use client";

// "Get test tokens" — calls the server faucet (/api/faucet) to mint mock SPL
// tokens to the connected wallet's devnet address. No wallet popup: the server
// signs with the faucet authority, the tokens just land in the wallet's token
// account. Lists every configured mock token with its live balance.

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Check, ChevronDown } from "lucide-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useNirvanaProgram } from "@/hooks/use-nirvana-program";
import { getConnection } from "@/lib/anchor";
import { MOCK_TOKENS } from "@/lib/tokens";

type TokenStatus = "idle" | "loading" | "done";

export function FaucetButton({ className = "" }: { className?: string }) {
  const { walletPubkey } = useNirvanaProgram();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<Record<string, TokenStatus>>({});

  const refreshBalances = useCallback(async () => {
    if (!walletPubkey) return;
    const conn = getConnection();
    const next: Record<string, number> = {};
    await Promise.all(
      MOCK_TOKENS.map(async (t) => {
        try {
          const ata = getAssociatedTokenAddressSync(
            new PublicKey(t.mint),
            walletPubkey
          );
          const res = await conn.getTokenAccountBalance(ata);
          next[t.mint] = res.value.uiAmount ?? 0;
        } catch {
          next[t.mint] = 0; // no token account yet → zero
        }
      })
    );
    setBalances(next);
  }, [walletPubkey]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  const mint = async (mintAddr: string) => {
    if (!walletPubkey || statuses[mintAddr] === "loading") return;
    setStatuses((s) => ({ ...s, [mintAddr]: "loading" }));
    setError(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletPubkey.toBase58(), mint: mintAddr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Faucet request failed.");
      setStatuses((s) => ({ ...s, [mintAddr]: "done" }));
      await refreshBalances();
      setTimeout(
        () => setStatuses((s) => ({ ...s, [mintAddr]: "idle" })),
        3000
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatuses((s) => ({ ...s, [mintAddr]: "idle" }));
    }
  };

  if (MOCK_TOKENS.length === 0) return null;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!walletPubkey}
        className="flex items-center gap-2 bg-[var(--glass-bg)] border border-mint/30 text-mint font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-mint/10 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Coins className="w-3.5 h-3.5" />
        Get test tokens
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-64 glass-plate rounded-lg p-2 shadow-xl">
            {MOCK_TOKENS.map((t) => {
              const st = statuses[t.mint] ?? "idle";
              const bal = balances[t.mint];
              return (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => mint(t.mint)}
                  disabled={st === "loading"}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-sm hover:bg-mint/5 transition-colors disabled:opacity-50 group"
                >
                  <div className="text-left">
                    <p className="font-mono text-xs font-bold text-on-surface group-hover:text-mint transition-colors">
                      {t.symbol}
                    </p>
                    <p className="font-mono text-[10px] text-on-surface-variant/60">
                      Balance: {(bal ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-mint uppercase tracking-widest shrink-0">
                    {st === "loading" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : st === "done" ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> +{t.faucetAmount.toLocaleString()}
                      </>
                    ) : (
                      <>+{t.faucetAmount.toLocaleString()}</>
                    )}
                  </span>
                </button>
              );
            })}
            {error && (
              <p className="font-mono text-[10px] text-red-400 px-3 py-2 break-words">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
