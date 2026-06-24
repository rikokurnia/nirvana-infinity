"use client";

import { useEffect, useState } from "react";
import { useStreams } from "@/hooks/use-streams";
import {
  formatTokenAmount,
  formatDate,
  formatAddress,
} from "@/lib/utils";
import { ExternalLink, History as HistoryIcon, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import {
  StreamListSkeleton,
  StreamsError,
} from "@/app/components/stream-states";

interface WithdrawEntry {
  signature: string;
  streamId: string;
  recipient: string;
  amount: string;
  tokenSymbol: string;
  tokenDecimals?: number;
  timestamp: number;
}

export default function WorkerHistoryPage() {
  const {
    getCompletedWorkerStreams,
    walletAddress,
    loading,
    error,
    refresh,
  } = useStreams();
  const [entries, setEntries] = useState<WithdrawEntry[]>([]);

  const completedStreams = getCompletedWorkerStreams(walletAddress);

  useEffect(() => {
    if (!walletAddress) return;
    try {
      const raw = localStorage.getItem(
        `nirvana:withdraw-history:${walletAddress}`
      );
      setEntries(raw ? (JSON.parse(raw) as WithdrawEntry[]) : []);
    } catch {
      setEntries([]);
    }
  }, [walletAddress]);

  const isEmpty = completedStreams.length === 0 && entries.length === 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">History</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          Completed streams and claim transactions
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
            Fully claimed streams and withdrawals appear here
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
                    <Link
                      key={stream.id}
                      href={`/dashboard/worker/streams/${stream.id}`}
                      className="glass-plate rounded-lg p-5 hover:border-mint/30 hover:bg-mint/[0.02] transition-all group block"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 w-7 h-7 rounded-sm flex items-center justify-center bg-mint/10 text-mint">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                          <div>
                            <p className="font-headline text-lg font-bold text-on-surface tracking-tight">
                              {formatTokenAmount(totalAmount, stream.tokenDecimals)}{" "}
                              {stream.tokenSymbol}
                            </p>
                            <p className="font-mono text-[10px] text-on-surface-variant/60 mt-1">
                              {stream.isCancelled ? (
                                <span className="text-red-400">Cancelled</span>
                              ) : (
                                <span className="text-mint">Fully claimed</span>
                              )}
                              {" · "}
                              Earned{" "}
                              {formatTokenAmount(
                                stream.claimedAmount,
                                stream.tokenDecimals
                              )}{" "}
                              {stream.tokenSymbol}
                            </p>
                            <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-0.5">
                              {formatDate(stream.startTime)} → {formatDate(stream.endTime)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="font-mono text-[10px] text-on-surface-variant/40">
                        {stream.id} — from {formatAddress(stream.authority)}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {entries.length > 0 && (
            <section>
              <h2 className="font-headline text-xl font-bold tracking-tight mb-4">
                Withdraw Transactions
              </h2>
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
                          +{formatTokenAmount(BigInt(e.amount), e.tokenDecimals ?? 9)}{" "}
                          {e.tokenSymbol}
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
            </section>
          )}
        </div>
      )}
    </div>
  );
}
