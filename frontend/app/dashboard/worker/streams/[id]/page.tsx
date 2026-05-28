"use client";

import { useState } from "react";
import { useStreams } from "@/hooks/use-streams";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ChevronRight,
  ArrowLeft,
  Clock,
  Target,
  Wallet,
  Shield,
  Calendar,
  User,
} from "lucide-react";
import {
  formatTokenAmount,
  calculateClaimable,
  calculateLinearUnlocked,
  calculateTotalUnlocked,
  formatPercentage,
  formatAddress,
  formatDate,
} from "@/lib/utils";

export default function WorkerStreamDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { getStream, getClaimable, handleWithdraw } = useStreams();
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  // Local flag — shared `loading` from useStreams stays true during background
  // RPC refetches, which would freeze the button forever ("PROCESSING…" bug).
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const onWithdraw = async (streamId: string) => {
    setWithdrawError(null);
    setIsWithdrawing(true);
    try {
      const signature = await handleWithdraw(streamId);
      setLastSignature(signature);
      // Persist for the History page (per-worker-wallet keyed in that page).
      try {
        const stream = getStream(streamId);
        const entry = {
          signature,
          streamId,
          recipient: stream?.recipient ?? "",
          amount: stream ? calculateClaimable(stream).toString() : "0",
          tokenSymbol: stream?.tokenSymbol ?? "",
          tokenDecimals: stream?.tokenDecimals ?? 9,
          timestamp: Date.now(),
        };
        const key = `nirvana:withdraw-history:${stream?.recipient ?? "unknown"}`;
        const prev = JSON.parse(localStorage.getItem(key) ?? "[]");
        localStorage.setItem(key, JSON.stringify([entry, ...prev].slice(0, 100)));
      } catch {
        // localStorage failures shouldn't block UI.
      }
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWithdrawing(false);
    }
  };

  const stream = getStream(id);

  if (!stream) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="font-mono text-sm text-on-surface-variant">Stream not found</p>
        <button
          onClick={() => router.push("/dashboard/worker/streams")}
          className="mt-4 text-mint font-mono text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
      </div>
    );
  }

  const totalAmount = stream.baseAmount + stream.milestoneAmount + stream.cliffAmount;
  const linearUnlocked = calculateLinearUnlocked(stream.startTime, stream.endTime, stream.baseAmount);
  const totalUnlocked = calculateTotalUnlocked(stream);
  const claimable = calculateClaimable(stream);
  const linearPct = formatPercentage(linearUnlocked, stream.baseAmount);
  const totalPct = formatPercentage(totalUnlocked, totalAmount);
  const claimedPct = formatPercentage(stream.claimedAmount, totalAmount);

  return (
    <div>
      <button
        onClick={() => router.push("/dashboard/worker/streams")}
        className="flex items-center gap-2 font-mono text-xs text-on-surface-variant hover:text-mint transition-colors mb-6 uppercase tracking-widest"
      >
        <ArrowLeft className="w-3 h-3" />
        Back
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-headline text-3xl font-bold tracking-tight">
            {stream.tokenSymbol} Stream
          </h1>
          <span className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest">
            {stream.id}
          </span>
        </div>
        <p className="font-mono text-xs text-on-surface-variant mt-1">
          {stream.isCancelled ? (
            <span className="text-red-400">Cancelled</span>
          ) : (
            <span className="text-mint">Active</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-plate rounded-lg p-6 border-mint/20 bg-mint/[0.02]"
        >
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-mint" />
            <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Claimable Now</span>
          </div>
          <p className="font-headline text-2xl font-bold text-mint tracking-tight">
            {formatTokenAmount(claimable, stream.tokenDecimals)}
          </p>
          <p className="font-mono text-[10px] text-on-surface-variant/50 mt-1">{stream.tokenSymbol}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-plate rounded-lg p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-mint" />
            <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Total Earned</span>
          </div>
          <p className="font-headline text-2xl font-bold text-on-surface tracking-tight">
            {formatTokenAmount(stream.claimedAmount, stream.tokenDecimals)}
          </p>
          <p className="font-mono text-[10px] text-on-surface-variant/50 mt-1">
            {claimedPct.toFixed(1)}% of total
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-plate rounded-lg p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-mint" />
            <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Total Allocation</span>
          </div>
          <p className="font-headline text-2xl font-bold text-on-surface tracking-tight">
            {formatTokenAmount(totalAmount, stream.tokenDecimals)}
          </p>
          <p className="font-mono text-[10px] text-on-surface-variant/50 mt-1">Linear + Milestone + Cliff</p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass-plate rounded-lg p-6 mb-8 border-mint/10"
      >
        <h3 className="font-headline text-base font-bold tracking-tight mb-4">Your Split</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-linear-to-r from-mint to-solana-green" />
              <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Linear</span>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-on-surface font-bold">{formatTokenAmount(stream.baseAmount, stream.tokenDecimals)}</p>
              <p className="font-mono text-[10px] text-on-surface-variant/50">paid over time</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-mint" />
              <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Milestone</span>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-on-surface font-bold">{formatTokenAmount(stream.milestoneAmount, stream.tokenDecimals)}</p>
              <p className={`font-mono text-[10px] ${stream.milestoneAchieved ? "text-mint" : "text-on-surface-variant/50"}`}>
                {stream.milestoneAchieved ? "unlocked" : "locked until KPI"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-solana-green" />
              <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Cliff Buffer</span>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-on-surface font-bold">{formatTokenAmount(stream.cliffAmount, stream.tokenDecimals)}</p>
              <p className={`font-mono text-[10px] ${Date.now() / 1000 >= stream.cliffTime ? "text-mint" : "text-on-surface-variant/50"}`}>
                {Date.now() / 1000 >= stream.cliffTime ? "unlocked" : "locked until " + new Date(stream.cliffTime * 1000).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-plate rounded-lg p-8 mb-8"
      >
        <h3 className="font-headline text-lg font-bold tracking-tight mb-6">Dual-Layer Progress</h3>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-4 h-4" /> Linear Base
              </span>
              <span className="font-mono text-xs text-mint font-bold">{linearPct.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${linearPct}%` }}
                transition={{ duration: 1, delay: 0.5 }}
                className="h-full bg-linear-to-r from-mint to-solana-green shadow-[0_0_10px_rgba(47,243,200,0.3)]"
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-mono text-[10px] text-on-surface-variant/50">{formatTokenAmount(stream.baseAmount, stream.tokenDecimals)} total</span>
              <span className="font-mono text-[10px] text-on-surface-variant/50">{formatTokenAmount(linearUnlocked, stream.tokenDecimals)} unlocked</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                <Target className="w-4 h-4" /> Milestone Bonus
              </span>
              <span className="font-mono text-xs text-mint font-bold">
                {stream.milestoneAchieved ? "ACHIEVED" : "LOCKED"}
              </span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: stream.milestoneAchieved ? "100%" : "0%" }}
                transition={{ duration: 1, delay: 0.6 }}
                className={`h-full ${stream.milestoneAchieved ? "bg-mint shadow-[0_0_10px_rgba(47,243,200,0.5)]" : "bg-white/10"}`}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-mono text-[10px] text-on-surface-variant/50">{formatTokenAmount(stream.milestoneAmount, stream.tokenDecimals)} bonus</span>
              <span className="font-mono text-[10px] text-on-surface-variant/50">{stream.milestoneAchieved ? "Ready to claim" : "Awaiting KPI"}</span>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <div className="flex justify-between mb-2">
              <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Total Progress</span>
              <span className="font-mono text-xs text-mint font-bold">{totalPct.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${totalPct}%` }}
                transition={{ duration: 1, delay: 0.7 }}
                className="h-full bg-linear-to-r from-mint/50 to-solana-green/50"
              />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-plate rounded-lg p-8 mb-8"
      >
        <h3 className="font-headline text-lg font-bold tracking-tight mb-6">Stream Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DetailRow icon={User} label="From (Authority)" value={formatAddress(stream.authority)} />
          <DetailRow icon={Calendar} label="Start" value={formatDate(stream.startTime)} />
          <DetailRow icon={Calendar} label="End" value={formatDate(stream.endTime)} />
          <DetailRow icon={Clock} label="Cliff" value={formatDate(stream.cliffTime)} />
        </div>
      </motion.div>

      {withdrawError && (
        <p className="mb-4 font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-sm px-4 py-3 break-words">
          {withdrawError}
        </p>
      )}

      {lastSignature && (
        <a
          href={`https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="mb-4 block font-mono text-xs text-mint bg-mint/5 border border-mint/30 rounded-sm px-4 py-3 hover:bg-mint/10 transition-colors break-all"
        >
          ✓ Withdraw confirmed · {lastSignature.slice(0, 16)}… (view on Solana Explorer)
        </a>
      )}

      {(() => {
        const nowSec = Date.now() / 1000;
        const isCancelled = stream.isCancelled;
        const preCliff = nowSec < stream.cliffTime;
        const fullyClaimed = totalUnlocked === stream.claimedAmount + stream.cliffAmount * BigInt(0) && !preCliff && claimable === BigInt(0) && stream.claimedAmount > BigInt(0);
        const nothingYet = claimable === BigInt(0) && stream.claimedAmount === BigInt(0) && !preCliff;
        const dust = claimable === BigInt(0) && stream.claimedAmount > BigInt(0) && !preCliff && !stream.milestoneAchieved;

        let title: string;
        let subtitle: string | null = null;
        let disabled = isWithdrawing || claimable === BigInt(0) || isCancelled;

        if (isWithdrawing) {
          title = "Processing…";
        } else if (isCancelled) {
          title = "Stream cancelled";
          subtitle = "No further withdrawals allowed.";
        } else if (preCliff) {
          title = "Locked until cliff";
          subtitle = `Unlocks ${formatDate(stream.cliffTime)} — cliff lump + linear vest become claimable then.`;
        } else if (claimable > BigInt(0)) {
          title = `Withdraw ${formatTokenAmount(claimable, stream.tokenDecimals)} ${stream.tokenSymbol}`;
        } else if (dust) {
          title = `0.00 ${stream.tokenSymbol} ready`;
          subtitle = stream.milestoneAchieved
            ? "All unlocked tokens already claimed. Stream complete."
            : `Linear is still vesting — next chunk available as time elapses. Milestone bonus (${formatTokenAmount(stream.milestoneAmount, stream.tokenDecimals)} ${stream.tokenSymbol}) unlocks when KPI is hit.`;
        } else if (nothingYet) {
          title = "Nothing claimable yet";
          subtitle = "Linear vest is still ramping up — check back shortly.";
        } else {
          title = `Withdraw 0.00 ${stream.tokenSymbol}`;
          subtitle = "Nothing claimable right now.";
        }

        return (
          <button
            onClick={() => onWithdraw(stream.id)}
            disabled={disabled}
            className="w-full bg-mint text-black font-mono font-bold px-8 py-4 rounded-sm hover:brightness-110 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(47,243,200,0.2)]"
          >
            <span className="flex items-center gap-2 text-sm uppercase">
              {title}
              {!isWithdrawing && claimable > BigInt(0) && <ChevronRight className="w-4 h-4" />}
            </span>
            {subtitle && (
              <span className="font-mono text-[10px] text-black/60 normal-case font-medium text-center leading-tight max-w-xl">
                {subtitle}
              </span>
            )}
          </button>
        );
      })()}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-mint"><Icon className="w-4 h-4" /></span>
      <div>
        <p className="font-mono text-[10px] text-on-surface-variant/50 uppercase tracking-widest">{label}</p>
        <p className="font-mono text-xs text-on-surface mt-0.5">{value}</p>
      </div>
    </div>
  );
}
