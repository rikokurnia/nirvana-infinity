"use client";

import { useStreams } from "@/hooks/use-streams";
import {
  formatTokenAmount,
  calculateClaimable,
  calculateLinearUnlocked,
  formatPercentage,
  formatAddress,
  formatDate,
} from "@/lib/utils";
import { motion } from "motion/react";
import { ChevronRight, Clock, Target, Wallet, Shield, Calendar } from "lucide-react";
import Link from "next/link";
import {
  StreamListSkeleton,
  StreamsEmpty,
  StreamsError,
} from "@/app/components/stream-states";

export default function WorkerStreamsPage() {
  const { getWorkerStreams, walletAddress, loading, error, refresh } = useStreams();
  // Filter by the signing Solana address (walletAddress), NOT user.wallet.address
  // — for MetaMask/EVM logins those differ and the list would show nothing.
  const workerAddress = walletAddress;
  const myStreams = getWorkerStreams(workerAddress);
  const showSkeleton = loading && myStreams.length === 0;
  const showError = !!error && myStreams.length === 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">My Streams</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          All token streams assigned to you
        </p>
      </div>

      {showError ? (
        <StreamsError message={error} onRetry={refresh} />
      ) : showSkeleton ? (
        <StreamListSkeleton />
      ) : myStreams.length === 0 ? (
        <StreamsEmpty message="No streams yet" />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {myStreams.map((stream) => {
            const claimable = calculateClaimable(stream);
            const linearUnlocked = calculateLinearUnlocked(stream.startTime, stream.endTime, stream.baseAmount);
            const totalAmount = stream.baseAmount + stream.milestoneAmount + stream.cliffAmount;
            const totalUnlocked = linearUnlocked + (stream.milestoneAchieved ? stream.milestoneAmount : BigInt(0));
            const totalPct = formatPercentage(totalUnlocked, totalAmount);
            const pastCliff = Date.now() / 1000 >= stream.cliffTime;

            return (
              <Link key={stream.id} href={`/dashboard/worker/streams/${stream.id}`}>
                <motion.div whileHover={{ y: -2 }} className="glass-plate rounded-lg p-6 group">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-headline text-lg font-bold text-on-surface">
                          {formatTokenAmount(totalAmount, stream.tokenDecimals)} {stream.tokenSymbol}
                        </span>
                        <span className={stream.isCancelled ? "font-mono text-[10px] text-red-400 uppercase tracking-widest" : "font-mono text-[10px] text-mint uppercase tracking-widest"}>
                          {stream.isCancelled ? "Cancelled" : `${totalPct.toFixed(1)}% unlocked`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest">
                        <span>{formatTokenAmount(stream.baseAmount, stream.tokenDecimals)} linear</span>
                        <span className="text-on-surface-variant/20">·</span>
                        <span>{formatTokenAmount(stream.milestoneAmount, stream.tokenDecimals)} milestone</span>
                        <span className="text-on-surface-variant/20">·</span>
                        <span>{formatTokenAmount(stream.cliffAmount, stream.tokenDecimals)} cliff</span>
                      </div>
                      <p className="font-mono text-[10px] text-on-surface-variant/40 mt-1">
                        {stream.id} — {formatDate(stream.startTime)} → {formatDate(stream.endTime)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {claimable > BigInt(0) && (
                        <span className="font-mono text-xs text-mint font-bold px-3 py-1 bg-mint/10 rounded-sm uppercase">
                          {formatTokenAmount(claimable, stream.tokenDecimals)} ready
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-mint/50 group-hover:text-mint transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-linear-to-r from-mint to-solana-green transition-all" style={{ width: `${totalPct}%` }} />
                    </div>
                    <div className="flex justify-between font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest">
                      <span>Stream: {stream.id}</span>
                      <span>Milestone: {stream.milestoneAchieved ? "Done" : "Pending"}</span>
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
