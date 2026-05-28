"use client";

import { useState } from "react";
import { useStreams } from "@/hooks/use-streams";
import { useAuth } from "@/app/providers/privy-provider";
import { formatTokenAmount, calculateClaimable, formatAddress, formatDate } from "@/lib/utils";
import { useMemo } from "react";
import { motion } from "motion/react";
import { Ban } from "lucide-react";

export default function FounderStreamsPage() {
  const { getFounderStreams, handleCancel } = useStreams();
  const { user } = useAuth();
  // Filter to streams this wallet created — never recipient-only ones.
  const streams = getFounderStreams(user?.wallet?.address || "");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Local flag — shared `loading` from useStreams stays true during background
  // RPC refetches, which would freeze the Cancel button on "Cancelling…".
  const [isCancelling, setIsCancelling] = useState(false);

  const cancellingStream = useMemo(
    () => streams.find((s) => s.id === confirmId),
    [streams, confirmId]
  );

  const confirmCancel = async () => {
    if (!confirmId) return;
    setCancelError(null);
    setIsCancelling(true);
    try {
      const signature = await handleCancel(confirmId);
      // Append to founder history.
      try {
        const key = `nirvana:founder-history:${user?.wallet?.address ?? "unknown"}`;
        const prev = JSON.parse(localStorage.getItem(key) ?? "[]");
        const entry = {
          type: "cancel" as const,
          signature,
          recipient: cancellingStream?.recipient ?? "",
          // Refunded = total allocated − already claimed, shown as base units string.
          amount:
            cancellingStream
              ? (
                  cancellingStream.baseAmount +
                  cancellingStream.milestoneAmount +
                  cancellingStream.cliffAmount -
                  cancellingStream.claimedAmount
                ).toString()
              : "0",
          amountIsBaseUnits: true,
          tokenSymbol: cancellingStream?.tokenSymbol ?? "",
          tokenDecimals: cancellingStream?.tokenDecimals ?? 9,
          timestamp: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify([entry, ...prev].slice(0, 200)));
      } catch {
        // localStorage errors shouldn't block the flow.
      }
      setConfirmId(null);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">My Streams</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          Manage all your created streams
        </p>
      </div>

      {streams.length === 0 ? (
        <div className="glass-plate rounded-lg p-12 text-center">
          <p className="font-mono text-sm text-on-surface-variant">No streams created yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {streams.map((stream) => {
            const claimable = calculateClaimable(stream);
            const totalAmount = stream.baseAmount + stream.milestoneAmount + stream.cliffAmount;
            return (
              <motion.div key={stream.id} whileHover={{ y: -2 }} className="glass-plate rounded-lg p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-headline text-lg font-bold text-on-surface">
                        {formatTokenAmount(totalAmount, stream.tokenDecimals)} {stream.tokenSymbol}
                      </span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-widest ${
                          stream.isCancelled
                            ? "bg-red-400/10 text-red-400"
                            : "bg-mint/10 text-mint"
                        }`}
                      >
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
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-[10px] font-mono text-on-surface-variant/50 uppercase tracking-widest mb-4">
                  <span>{formatDate(stream.startTime)} → {formatDate(stream.endTime)}</span>
                  <span>Cliff: {formatDate(stream.cliffTime)}</span>
                  <span>Milestone: {stream.milestoneAchieved ? "Achieved" : "Pending"}</span>
                </div>

                <div className="flex gap-3">
                  {!stream.isCancelled && (
                    <button
                      onClick={() => {
                        setCancelError(null);
                        setConfirmId(stream.id);
                      }}
                      className="flex items-center gap-1 border border-red-400/30 text-red-400 font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-red-400/10 transition-all uppercase"
                    >
                      <Ban className="w-3 h-3" />
                      Cancel Stream
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-plate rounded-lg p-6 max-w-md w-full">
            <h2 className="font-headline text-lg font-bold text-on-surface mb-2">
              Cancel this stream?
            </h2>
            <p className="font-mono text-xs text-on-surface-variant mb-4">
              Vested tokens settle to the recipient and the unvested remainder
              returns to you. This cannot be undone.
            </p>
            {cancelError && (
              <p className="font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-sm px-4 py-3 mb-4 break-words">
                {cancelError}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                disabled={isCancelling}
                className="font-mono text-xs font-bold px-4 py-2 rounded-sm border border-white/10 text-on-surface-variant hover:bg-white/5 transition-all uppercase disabled:opacity-50"
              >
                Keep Stream
              </button>
              <button
                onClick={confirmCancel}
                disabled={isCancelling}
                className="flex items-center gap-1 bg-red-400/90 text-black font-mono text-xs font-bold px-4 py-2 rounded-sm hover:brightness-110 transition-all uppercase disabled:opacity-50"
              >
                <Ban className="w-3 h-3" />
                {isCancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
