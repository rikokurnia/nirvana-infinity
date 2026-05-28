"use client";

// "Get test USDC" — calls the server faucet (/api/faucet) to mint mock USDC to
// the connected wallet's devnet address. No wallet popup: the server signs with
// the faucet authority, the tokens just land in the wallet's token account.
// Also shows the wallet's live mUSDC balance.

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Check } from "lucide-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useNirvanaProgram } from "@/hooks/use-nirvana-program";
import { getConnection } from "@/lib/anchor";

const MOCK_USDC_MINT = process.env.NEXT_PUBLIC_MOCK_USDC_MINT;

export function FaucetButton({ className = "" }: { className?: string }) {
  const { walletPubkey } = useNirvanaProgram();
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!walletPubkey || !MOCK_USDC_MINT) return;
    try {
      const ata = getAssociatedTokenAddressSync(
        new PublicKey(MOCK_USDC_MINT),
        walletPubkey
      );
      const res = await getConnection().getTokenAccountBalance(ata);
      setBalance(res.value.uiAmount ?? 0);
    } catch {
      // No token account yet → treat as zero balance.
      setBalance(0);
    }
  }, [walletPubkey]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const handleClick = async () => {
    if (!walletPubkey || status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletPubkey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Faucet request failed.");
      setStatus("done");
      await refreshBalance();
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      {balance !== null && (
        <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">
          Balance:{" "}
          <span className="text-mint font-bold">
            {balance.toLocaleString()} mUSDC
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={!walletPubkey || status === "loading"}
        className={`flex items-center gap-2 bg-white/5 border border-mint/30 text-mint font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-mint/10 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {status === "loading" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status === "done" ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Coins className="w-3.5 h-3.5" />
        )}
        {status === "loading"
          ? "Minting…"
          : status === "done"
            ? "+1,000 mUSDC"
            : "Get test USDC"}
      </button>
      {error && (
        <span className="font-mono text-[10px] text-red-400 max-w-xs text-right break-words">
          {error}
        </span>
      )}
    </div>
  );
}
