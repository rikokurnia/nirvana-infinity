"use client";

import { useEffect, useState } from "react";
import { useStreams } from "@/hooks/use-streams";
import {
  formatTokenAmount,
  formatAddress,
  formatDate,
} from "@/lib/utils";
import {
  ExternalLink,
  History as HistoryIcon,
  PlusCircle,
  Ban,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import {
  StreamListSkeleton,
  StreamsError,
} from "@/app/components/stream-states";

interface FounderHistoryEntry {
  type: "create" | "cancel";
  signature: string;
  recipient: string;
  amount: string;
  amountIsBaseUnits?: boolean;
  tokenSymbol: string;
  tokenDecimals?: number;
  timestamp: number;
}

export default function FounderHistoryPage() {
  const {
    getCompletedFounderStreams,
    walletAddress,
    loading,
    error,
    refresh,
  } = useStreams();
  const [entries, setEntries] = useState<FounderHistoryEntry[]>([]);

  const completedStreams = getCompletedFounderStreams(walletAddress);

  useEffect(() => {
    if (!walletAddress) return;
    try {
      const raw = localStorage.getItem(
        `nirvana:founder-history:${walletAddress}`
      );
      setEntries(raw ? (JSON.parse(raw) as FounderHistoryEntry[]) : []);
    } catch {
      setEntries([]);
    }
  }, [walletAddress]);

  const formatAmount = (e: FounderHistoryEntry) => {
    if (e.amountIsBaseUnits) {
      return formatTokenAmount(BigInt(e.amount), e.tokenDecimals ?? 9);
    }
    const n = parseFloat(e.amount);
    return Number.isFinite(n) ? n.toLocaleString() : e.amount;
  };

  const isEmpty = completedStreams.length === 0 && entries.length === 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">Founder History</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          Completed streams and create/cancel activity
        </p>
      </div>

      {error && completedStreams.length === 0 && entries.length === 0 ? (
        <StreamsError message={error} onRetry={refresh} />
      ) : loading && isEmpty ? (
        <StreamListSkeleton count={2} />
      ) : isEmpty ? (
        <div className="glass-plate rounded-lg p-12 text-center">
          <HistoryIcon className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-3" />
          <p className="font-mono text-sm text-on-surface-variant">No history yet</p>
          <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-2">
            Finished streams and transactions appear here
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {completedStreams.length > 0 && (
            <section>
              <h2 className="font-headline text-xl font-bold tracking-tight mb-4">
                Completed Streams
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {completedStreams.map((stream) => {
                  const totalAmount =
                    stream.baseAmount +
                    stream.milestoneAmount +
                    stream.cliffAmount;
                  return (
                    <div
                      key={stream.id}
                      className="glass-plate rounded-lg p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 w-7 h-7 rounded-sm flex items-center justify-center ${
                            stream.isCancelled
                              ? "bg-red-400/10 text-red-400"
                              : "bg-mint/10 text-mint"
                          }`}
                        >
                          {stream.isCancelled ? (
                            <Ban className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-headline text-lg font-bold text-on-surface tracking-tight">
                            {formatTokenAmount(totalAmount, stream.tokenDecimals)}{" "}
                            {stream.tokenSymbol}
                          </p>
                          <p className="font-mono text-[10px] text-on-surface-variant/60 mt-1">
                            To {formatAddress(stream.recipient)}
                            {" · "}
                            {stream.isCancelled ? (
                              <span className="text-red-400">Cancelled</span>
                            ) : (
                              <span className="text-mint">Completed</span>
                            )}
                          </p>
                          <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-0.5">
                            {formatDate(stream.startTime)} → {formatDate(stream.endTime)}
                          </p>
                          <p className="font-mono text-[10px] text-on-surface-variant/40 mt-1">
                            {stream.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {entries.length > 0 && (
            <section>
              <h2 className="font-headline text-xl font-bold tracking-tight mb-4">
                Transactions
              </h2>
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
                            {isCreate ? (
                              <PlusCircle className="w-4 h-4" />
                            ) : (
                              <Ban className="w-4 h-4" />
                            )}
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
                              <span className="text-on-surface-variant">
                                {formatAddress(e.recipient)}
                              </span>
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
            </section>
          )}

          {completedStreams.length === 0 && entries.length > 0 && (
            <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest">
              <Link href="/dashboard/founder/streams" className="text-mint hover:brightness-110">
                My Streams
              </Link>{" "}
              shows streams still in progress or awaiting milestone action.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
