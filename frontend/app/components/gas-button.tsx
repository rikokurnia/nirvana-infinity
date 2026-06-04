"use client";

// "Get gas SOL" — workers receive their tokens via the stream, but their Privy
// wallet starts with 0 devnet SOL and can't pay the withdraw fee/rent. This
// calls the server faucet in gasOnly mode to drip a little SOL. No wallet popup.

import { useState } from "react";
import { Fuel, Loader2, Check } from "lucide-react";
import { useNirvanaProgram } from "@/hooks/use-nirvana-program";

type Status = "idle" | "loading" | "done";

export function GasButton({ className = "" }: { className?: string }) {
  const { walletPubkey } = useNirvanaProgram();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const getGas = async () => {
    if (!walletPubkey || status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletPubkey.toBase58(), gasOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gas request failed.");
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={getGas}
        disabled={!walletPubkey || status === "loading"}
        className="flex items-center gap-2 bg-[var(--glass-bg)] border border-mint/30 text-mint font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-mint/10 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "loading" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status === "done" ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Fuel className="w-3.5 h-3.5" />
        )}
        {status === "done" ? "Gas added" : "Get gas SOL"}
      </button>
      {error && (
        <p className="absolute right-0 mt-1 font-mono text-[10px] text-red-400 break-words max-w-[16rem]">
          {error}
        </p>
      )}
    </div>
  );
}
