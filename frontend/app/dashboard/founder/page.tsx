"use client";

import { useStreams } from "@/hooks/use-streams";
import {
  formatTokenAmount,
  calculateClaimable,
  formatAddress,
} from "@/lib/utils";
import { motion } from "motion/react";
import {
  Layers,
  Wallet,
  ArrowUpRight,
  Target,
  Users,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { FaucetButton } from "@/app/components/faucet-button";
import {
  StatCardsSkeleton,
  StreamListSkeleton,
  StreamsEmpty,
  StreamsError,
} from "@/app/components/stream-states";

export default function FounderPage() {
  const { getFounderStreams, getActiveFounderStreams, walletAddress, loading, error, refresh } = useStreams();
  // Only show streams this wallet *created* — recipient-only streams belong
  // on the worker view and must never bleed into the founder dashboard.
  // Filter by the signing Solana address (walletAddress), NOT user.wallet.address
  // — for MetaMask/EVM logins those differ and the dashboard would show nothing.
  const founderAddress = walletAddress;
  const streams = getFounderStreams(founderAddress);
  const activeStreams = getActiveFounderStreams(founderAddress);
  // Show skeletons on first load; keep showing data during background refetches.
  const showSkeleton = loading && streams.length === 0;
  const showError = !!error && streams.length === 0;

  const totalAllocated = activeStreams.reduce(
    (sum, s) => sum + s.baseAmount + s.milestoneAmount + s.cliffAmount,
    BigInt(0)
  );
  const totalClaimed = streams.reduce((sum, s) => sum + s.claimedAmount, BigInt(0));
  const pendingMilestones = activeStreams.filter(
    (s) => !s.milestoneAchieved && s.milestoneAmount > BigInt(0)
  ).length;
  const uniqueRecipients = new Set(activeStreams.map((s) => s.recipient)).size;

  const recentStreams = activeStreams.slice(0, 5);

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight">Founder Dashboard</h1>
          <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
            Manage your token distribution streams
          </p>
        </div>
        <FaucetButton />
      </div>

      {showSkeleton ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatCard icon={Layers} label="Active Streams" value={activeStreams.length.toString()} />
          <StatCard
            icon={Wallet}
            label="Total Allocated"
            value={formatTokenAmount(totalAllocated, streams[0]?.tokenDecimals ?? 9)}
          />
          <StatCard
            icon={ArrowUpRight}
            label="Total Claimed"
            value={formatTokenAmount(totalClaimed, streams[0]?.tokenDecimals ?? 9)}
            highlight
          />
          <StatCard icon={Users} label="Recipients" value={uniqueRecipients.toString()} />
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="font-headline text-xl font-bold tracking-tight">Active Streams</h2>
        <Link
          href="/dashboard/founder/create"
          className="bg-mint text-black font-mono text-xs font-bold px-4 py-2 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase flex items-center gap-2"
        >
          New Stream
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {showError ? (
        <StreamsError message={error} onRetry={refresh} />
      ) : showSkeleton ? (
        <StreamListSkeleton />
      ) : activeStreams.length === 0 ? (
        <StreamsEmpty
          message={
            streams.length === 0
              ? "No streams created yet"
              : "No active streams — see History for completed ones"
          }
          action={
            streams.length === 0 ? (
              <Link
                href="/dashboard/founder/create"
                className="text-mint font-mono text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-colors"
              >
                Create your first stream
              </Link>
            ) : (
              <Link
                href="/dashboard/founder/history"
                className="text-mint font-mono text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-colors"
              >
                View history
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recentStreams.map((stream) => {
            const claimable = calculateClaimable(stream);
            const totalAmount = stream.baseAmount + stream.milestoneAmount + stream.cliffAmount;
            const claimedPct = Number((stream.claimedAmount * BigInt(100)) / totalAmount);
            const now = Date.now() / 1000;
            const totalDuration = stream.endTime - stream.startTime;
            const elapsed = Math.max(0, now - stream.startTime);
            const timeProgress = Math.min(100, Math.round((elapsed / totalDuration) * 100));
            const pastCliff = now >= stream.cliffTime;
            return (
              <motion.div
                key={stream.id}
                whileHover={{ y: -2 }}
                className="glass-plate rounded-lg p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-headline text-lg font-bold text-on-surface">
                        {formatTokenAmount(totalAmount, stream.tokenDecimals)} {stream.tokenSymbol}
                      </span>
                      <span className={`font-mono text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-widest ${stream.isCancelled ? "bg-red-400/10 text-red-400" : "bg-mint/10 text-mint"}`}>
                        {stream.isCancelled ? "Cancelled" : "Active"}
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
                      To: {formatAddress(stream.recipient)} — {stream.id}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xs text-mint font-bold">
                      {formatTokenAmount(claimable, stream.tokenDecimals)} claimable
                    </p>
                    <p className="font-mono text-[10px] text-on-surface-variant/50 mt-0.5">
                      {claimedPct}% claimed
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="font-mono text-[9px] text-on-surface-variant/40 uppercase tracking-widest">Time</span>
                      <span className="font-mono text-[9px] text-on-surface-variant/40">{timeProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-surface-3 transition-all" style={{ width: `${timeProgress}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono text-[10px] ${pastCliff ? "text-mint" : "text-on-surface-variant/40"}`}>
                      {pastCliff ? "Cliff Unlocked" : "Cliff Locked"}
                    </p>
                    <p className={`font-mono text-[10px] ${stream.milestoneAchieved ? "text-mint" : "text-on-surface-variant/40"}`}>
                      {stream.milestoneAchieved ? "Bonus Done" : "Bonus Pending"}
                    </p>
                  </div>
                </div>

                <Link
                  href="/dashboard/founder/streams"
                  className="text-mint font-mono text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-1"
                >
                  Manage
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`glass-plate rounded-lg p-6 ${highlight ? "border-mint/20 bg-mint/[0.02]" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-mint" />
        <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">{label}</span>
      </div>
      <p className={`font-headline text-2xl font-bold tracking-tight ${highlight ? "text-mint" : "text-on-surface"}`}>
        {value}
      </p>
    </div>
  );
}
