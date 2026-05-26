"use client";

import { useState } from "react";
import { useStreams } from "@/hooks/use-streams";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ChevronRight,
  Sliders,
  Sparkles,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  getPresets,
  calculateStreamSplit,
  type StreamPreset,
} from "@/lib/stream-calculator";

const COMMON_TOKENS = [
  { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
];

interface RecipientRow {
  id: string;
  address: string;
  amount: string;
}

function newRow(): RecipientRow {
  return { id: Math.random().toString(36).slice(2, 8), address: "", amount: "" };
}

export default function CreateStreamPage() {
  const { handleCreateStream, loading } = useStreams();
  const router = useRouter();
  const presets = getPresets();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [tokenSymbol, setTokenSymbol] = useState("SOL");
  const [selectedPreset, setSelectedPreset] = useState<StreamPreset>(presets[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [recipients, setRecipients] = useState<RecipientRow[]>([newRow()]);

  const updateRecipient = (id: string, field: "address" | "amount", value: string) => {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const removeRecipient = (id: string) => {
    if (recipients.length <= 1) return;
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  };

  const addRecipient = () => {
    setRecipients((prev) => [...prev, newRow()]);
  };

  const validRecipients = recipients.filter((r) => r.address.trim() && r.amount.trim() && parseFloat(r.amount) > 0);
  const totalAmount = validRecipients.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  const totalLinear = (totalAmount * selectedPreset.linearPercent) / 100;
  const totalMilestone = (totalAmount * selectedPreset.milestonePercent) / 100;
  const totalCliff = (totalAmount * selectedPreset.cliffPercent) / 100;

  const getSplit = (amount: string) => {
    if (!amount || !startDate || !endDate) return null;
    const start = Math.floor(new Date(startDate).getTime() / 1000);
    const end = Math.floor(new Date(endDate).getTime() / 1000);
    if (start >= end) return null;
    return calculateStreamSplit(parseFloat(amount), start, end, selectedPreset);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validRecipients.length === 0 || !startDate || !endDate) return;

    const start = Math.floor(new Date(startDate).getTime() / 1000);
    const end = Math.floor(new Date(endDate).getTime() / 1000);
    const tokenMint = COMMON_TOKENS.find((t) => t.symbol === tokenSymbol)?.mint || COMMON_TOKENS[0].mint;

    setSubmitError(null);
    try {
      for (const r of validRecipients) {
        const split = getSplit(r.amount);
        if (!split) continue;
        await handleCreateStream({
          recipient: r.address.trim(),
          tokenMint,
          tokenSymbol,
          baseAmount: split.linearAmount,
          milestoneAmount: split.milestoneAmount,
          cliffAmount: split.cliffAmount,
          startTime: start,
          endTime: end,
          cliffTime: split.cliffTime,
        });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      return; // stay on the form so the user can fix and retry
    }

    router.push("/dashboard/founder");
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight">Create Streams</h1>
        <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
          Pay multiple team members with one setup
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3 space-y-6"
          >
            <div className="glass-plate rounded-lg p-6">
              <h3 className="font-headline text-base font-bold tracking-tight mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-mint" />
                Stream Settings
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Token</label>
                  <select
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value)}
                    className="w-full bg-white/3 border border-white/10 rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-mint/40 transition-colors appearance-none cursor-pointer"
                  >
                    {COMMON_TOKENS.map((t) => (
                      <option key={t.symbol} value={t.symbol} className="bg-surface text-on-surface">{t.symbol}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Preset</label>
                  <select
                    value={selectedPreset.name}
                    onChange={(e) => {
                      const p = presets.find((x) => x.name === e.target.value);
                      if (p) setSelectedPreset(p);
                    }}
                    className="w-full bg-white/3 border border-white/10 rounded-sm px-3 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-mint/40 transition-colors appearance-none cursor-pointer"
                  >
                    {presets.map((p) => (
                      <option key={p.name} value={p.name} className="bg-surface text-on-surface">{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white/3 border border-white/10 rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-mint/40 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white/3 border border-white/10 rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-mint/40 transition-colors"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="glass-plate rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headline text-base font-bold tracking-tight flex items-center gap-2">
                  <Users className="w-4 h-4 text-mint" />
                  Recipients <span className="font-mono text-xs text-mint">({validRecipients.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={addRecipient}
                  className="flex items-center gap-1.5 bg-mint text-black font-mono text-[10px] font-bold px-3 py-2 rounded-sm hover:brightness-110 transition-all uppercase"
                >
                  <Plus className="w-3 h-3" />
                  Add Recipient
                </button>
              </div>

              <div className="space-y-3">
                {recipients.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-on-surface-variant/30 w-4 shrink-0">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      value={r.address}
                      onChange={(e) => updateRecipient(r.id, "address", e.target.value)}
                      placeholder="Recipient wallet address"
                      className="flex-1 bg-white/3 border border-white/10 rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-mint/40 transition-colors"
                    />
                    <input
                      type="number"
                      value={r.amount}
                      onChange={(e) => updateRecipient(r.id, "amount", e.target.value)}
                      placeholder="Amount"
                      step="any"
                      min="0"
                      className="w-32 bg-white/3 border border-white/10 rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-mint/40 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => removeRecipient(r.id)}
                      disabled={recipients.length <= 1}
                      className="p-2 text-on-surface-variant/30 hover:text-red-400 transition-colors disabled:opacity-0 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {validRecipients.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Total Across All
                  </span>
                  <span className="font-mono text-sm text-mint font-bold">
                    {totalAmount.toLocaleString()} {tokenSymbol}
                  </span>
                </div>
              )}
            </div>

            {submitError && (
              <p className="font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-sm px-4 py-3 break-words">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || validRecipients.length === 0}
              className="w-full bg-mint text-black font-mono text-sm font-bold px-8 py-4 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(47,243,200,0.2)]"
            >
              {loading
                ? "Creating..."
                : `Create ${validRecipients.length} Stream${validRecipients.length !== 1 ? "s" : ""}`}
              {!loading && <ChevronRight className="w-4 h-4" />}
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-2 space-y-4"
          >
            <div className="glass-plate rounded-lg p-6 h-fit">
              <h3 className="font-headline text-base font-bold tracking-tight mb-4 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-mint" />
                Split Preview
              </h3>

              {validRecipients.length > 0 && startDate && endDate ? (
                <div className="space-y-4">
                  <div className="text-center mb-2">
                    <p className="font-headline text-xl font-bold text-mint tracking-tight">
                      {totalAmount.toLocaleString()} {tokenSymbol}
                    </p>
                    <p className="font-mono text-[9px] text-on-surface-variant/50 uppercase tracking-widest mt-0.5">
                      {selectedPreset.label} · {validRecipients.length} recipient{validRecipients.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
                    <div className="h-full bg-linear-to-r from-mint to-solana-green transition-all" style={{ width: `${selectedPreset.linearPercent}%` }} />
                    <div className="h-full bg-mint transition-all" style={{ width: `${selectedPreset.milestonePercent}%` }} />
                    <div className="h-full bg-solana-green transition-all" style={{ width: `${selectedPreset.cliffPercent}%` }} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm bg-linear-to-r from-mint to-solana-green" />
                        <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Linear</span>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-on-surface font-bold">{totalLinear.toLocaleString()}</p>
                        <p className="font-mono text-[9px] text-on-surface-variant/50">{selectedPreset.linearPercent}%</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm bg-mint" />
                        <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Milestone</span>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-on-surface font-bold">{totalMilestone.toLocaleString()}</p>
                        <p className="font-mono text-[9px] text-on-surface-variant/50">{selectedPreset.milestonePercent}%</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm bg-solana-green" />
                        <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Cliff Buffer</span>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-on-surface font-bold">{totalCliff.toLocaleString()}</p>
                        <p className="font-mono text-[9px] text-on-surface-variant/50">{selectedPreset.cliffPercent}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-mint/5 rounded-sm border border-mint/10">
                    <p className="font-sans text-xs text-on-surface-variant leading-relaxed">
                      {selectedPreset.description || `${selectedPreset.label}: ${selectedPreset.linearPercent}% linear salary, ${selectedPreset.milestonePercent}% milestone bonus, ${selectedPreset.cliffPercent}% cliff buffer.`}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="font-mono text-xs text-on-surface-variant/50 leading-relaxed">
                  Add at least one recipient with an amount and set dates to see the split preview.
                </p>
              )}
            </div>

            {validRecipients.length > 0 && (
              <div className="glass-plate rounded-lg p-6">
                <h3 className="font-headline text-base font-bold tracking-tight mb-4">Recipients</h3>
                <div className="space-y-2">
                  {validRecipients.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <div>
                        <p className="font-mono text-xs text-on-surface">{r.address.slice(0, 6)}...{r.address.slice(-4)}</p>
                      </div>
                      <span className="font-mono text-xs text-mint font-bold">
                        {parseFloat(r.amount).toLocaleString()} {tokenSymbol}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </form>
    </div>
  );
}
