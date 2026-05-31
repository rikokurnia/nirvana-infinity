"use client";

import { useStreams } from "@/hooks/use-streams";
import { useAuth } from "@/app/providers/privy-provider";
import {
  formatTokenAmount,
  calculateClaimable,
} from "@/lib/utils";
import { motion } from "motion/react";
import {
  Layers,
  Wallet,
  ArrowUpRight,
  Target,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

export default function WorkerPage() {
  const { getWorkerStreams } = useStreams();
  const { user } = useAuth();

  const workerAddress = user?.wallet?.address || "";
  const myStreams = getWorkerStreams(workerAddress);
  const activeStreams = myStreams.filter((s) => !s.isCancelled);
  const totalClaimed = myStreams.reduce((sum, s) => sum + s.claimedAmount, BigInt(0));
  const totalClaimable = activeStreams.reduce(
    (sum, s) => sum + calculateClaimable(s),
    BigInt(0)
  );
  const pendingMilestones = activeStreams.filter((s) => !s.milestoneAchieved).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">Worker Dashboard</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          Track your incoming token streams
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <StatCard icon={Layers} label="Active Streams" value={activeStreams.length.toString()} />
        <StatCard
          icon={ArrowUpRight}
          label="Claimable Now"
          value={formatTokenAmount(totalClaimable, myStreams[0]?.tokenDecimals ?? 9)}
          highlight
        />
        <StatCard icon={Wallet} label="Total Earned" value={formatTokenAmount(totalClaimed, myStreams[0]?.tokenDecimals ?? 9)} />
        <StatCard icon={Target} label="Pending Milestones" value={pendingMilestones.toString()} />
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="font-headline text-xl font-bold tracking-tight">My Streams</h2>
      </div>

      {myStreams.length === 0 ? (
        <div className="glass-plate rounded-lg p-12 text-center">
          <p className="font-mono text-sm text-on-surface-variant">No streams assigned yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {myStreams.map((stream) => {
            const claimable = calculateClaimable(stream);
            const totalAmount = stream.baseAmount + stream.milestoneAmount + stream.cliffAmount;
            const claimedPct = Number((stream.claimedAmount * BigInt(100)) / totalAmount);
            const now = Date.now() / 1000;
            const pastCliff = now >= stream.cliffTime;
            const timePct = Math.min(100, Math.max(0, Math.round(((now - stream.startTime) / (stream.endTime - stream.startTime)) * 100)));
            return (
              <Link key={stream.id} href={`/dashboard/worker/streams/${stream.id}`}>
                <motion.div whileHover={{ y: -2 }} className="glass-plate rounded-lg p-6">
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
                    </div>
                    <div className="text-right shrink-0">
                      {claimable > BigInt(0) && (
                        <span className="font-mono text-xs text-mint font-bold block">
                          {formatTokenAmount(claimable, stream.tokenDecimals)} ready
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-on-surface-variant/50 mt-0.5 block">
                        {claimedPct}% claimed
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-[9px] text-on-surface-variant/50 uppercase tracking-widest">Time</span>
                        <span className="font-mono text-[9px] text-on-surface-variant/50">{timePct}%</span>
                      </div>
                      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-linear-to-r from-mint to-solana-green" style={{ width: `${claimedPct}%` }} />
                        <div className="h-full bg-surface-3" style={{ width: `${Math.max(0, timePct - claimedPct)}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 font-mono text-[9px] uppercase tracking-widest">
                      <span className={pastCliff ? "text-mint" : "text-on-surface-variant/40"}>
                        {pastCliff ? "Cliff Unlocked" : "Cliff Locked"}
                      </span>
                      <span className={stream.milestoneAchieved ? "text-mint" : "text-on-surface-variant/40"}>
                        {stream.milestoneAchieved ? "Bonus Ready" : "Bonus Pending"}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-mint/50" />
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
