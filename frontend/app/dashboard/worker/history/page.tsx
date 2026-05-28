"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers/privy-provider";
import { formatTokenAmount, formatDate } from "@/lib/utils";
import { ExternalLink, History as HistoryIcon } from "lucide-react";

interface WithdrawEntry {
  signature: string;
  streamId: string;
  recipient: string;
  amount: string; // bigint serialized as string
  tokenSymbol: string;
  tokenDecimals?: number;
  timestamp: number; // ms
}

export default function WorkerHistoryPage() {
  const { user } = useAuth();
  const address = user?.wallet?.address ?? "";
  const [entries, setEntries] = useState<WithdrawEntry[]>([]);

  useEffect(() => {
    if (!address) return;
    try {
      const raw = localStorage.getItem(`nirvana:withdraw-history:${address}`);
      setEntries(raw ? (JSON.parse(raw) as WithdrawEntry[]) : []);
    } catch {
      setEntries([]);
    }
  }, [address]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">Withdraw History</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          Every claim transaction from this wallet
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="glass-plate rounded-lg p-12 text-center">
          <HistoryIcon className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-3" />
          <p className="font-mono text-sm text-on-surface-variant">No withdrawals yet</p>
          <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-2">
            Claim from a stream to see it here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {entries.map((e) => (
            <a
              key={e.signature}
              href={`https://explorer.solana.com/tx/${e.signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="glass-plate rounded-lg p-5 hover:border-mint/30 hover:bg-mint/[0.02] transition-all group"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-headline text-lg font-bold text-on-surface tracking-tight">
                    +{formatTokenAmount(BigInt(e.amount), e.tokenDecimals ?? 9)} {e.tokenSymbol}
                  </p>
                  <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-0.5">
                    {formatDate(Math.floor(e.timestamp / 1000))}
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 text-on-surface-variant/40 group-hover:text-mint transition-colors" />
              </div>
              <p className="font-mono text-[10px] text-on-surface-variant/40 break-all">
                {e.signature}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
