"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers/privy-provider";
import { formatTokenAmount, formatAddress, formatDate } from "@/lib/utils";
import { ExternalLink, History as HistoryIcon, PlusCircle, Ban } from "lucide-react";

interface FounderHistoryEntry {
  type: "create" | "cancel";
  signature: string;
  recipient: string;
  // For "create" this is the UI float string (e.g. "100"); for "cancel" it's
  // base-units (refund), serialized as a bigint string.
  amount: string;
  amountIsBaseUnits?: boolean;
  tokenSymbol: string;
  tokenDecimals?: number;
  timestamp: number;
}

export default function FounderHistoryPage() {
  const { user } = useAuth();
  const address = user?.wallet?.address ?? "";
  const [entries, setEntries] = useState<FounderHistoryEntry[]>([]);

  useEffect(() => {
    if (!address) return;
    try {
      const raw = localStorage.getItem(`nirvana:founder-history:${address}`);
      setEntries(raw ? (JSON.parse(raw) as FounderHistoryEntry[]) : []);
    } catch {
      setEntries([]);
    }
  }, [address]);

  const formatAmount = (e: FounderHistoryEntry) => {
    if (e.amountIsBaseUnits) {
      return formatTokenAmount(BigInt(e.amount), e.tokenDecimals ?? 9);
    }
    // UI float already.
    const n = parseFloat(e.amount);
    return Number.isFinite(n) ? n.toLocaleString() : e.amount;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">Founder History</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          Every stream you created or cancelled
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="glass-plate rounded-lg p-12 text-center">
          <HistoryIcon className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-3" />
          <p className="font-mono text-sm text-on-surface-variant">No activity yet</p>
          <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-2">
            Create or cancel a stream to see it here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {entries.map((e) => {
            const isCreate = e.type === "create";
            return (
              <a
                key={e.signature}
                href={`https://explorer.solana.com/tx/${e.signature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="glass-plate rounded-lg p-5 hover:border-mint/30 hover:bg-mint/[0.02] transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 w-7 h-7 rounded-sm flex items-center justify-center ${
                        isCreate
                          ? "bg-mint/10 text-mint"
                          : "bg-red-400/10 text-red-400"
                      }`}
                    >
                      {isCreate ? <PlusCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                    </span>
                    <div>
                      <p className="font-headline text-lg font-bold text-on-surface tracking-tight">
                        {isCreate ? "Created" : "Cancelled"}{" "}
                        <span className={isCreate ? "text-mint" : "text-red-400"}>
                          {isCreate ? "+" : "↩"}
                          {formatAmount(e)} {e.tokenSymbol}
                        </span>
                      </p>
                      <p className="font-mono text-[10px] text-on-surface-variant/60 mt-1">
                        {isCreate ? "to" : "refunded from"}{" "}
                        <span className="text-on-surface-variant">{formatAddress(e.recipient)}</span>
                      </p>
                      <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-0.5">
                        {formatDate(Math.floor(e.timestamp / 1000))}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-on-surface-variant/40 group-hover:text-mint transition-colors shrink-0" />
                </div>
                <p className="font-mono text-[10px] text-on-surface-variant/40 break-all">
                  {e.signature}
                </p>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
