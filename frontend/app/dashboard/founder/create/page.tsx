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
import { FaucetButton } from "@/app/components/faucet-button";
import { useAuth } from "@/app/providers/privy-provider";
import { MOCK_TOKENS } from "@/lib/tokens";

// Streamable tokens = the devnet mock SPL tokens the in-app faucet can mint
// (see lib/tokens.ts). Every option here is fundable, so create_stream never
// fails on an empty/missing source token account.
const COMMON_TOKENS = MOCK_TOKENS;

interface RecipientRow {
  id: string;
  address: string;
  amount: string;
}

function newRow(): RecipientRow {
  return { id: Math.random().toString(36).slice(2, 8), address: "", amount: "" };
}

export default function CreateStreamPage() {
  const { handleCreateStream, handleReleaseVault } = useStreams();
  const { user } = useAuth();
  const router = useRouter();
  // When the program rejects create_stream because a stuck vault PDA exists
  // from a previously-cancelled stream, we cache the recipient that hit it so
  // the UI can offer a "Release stuck vault" action.
  const [stuckVault, setStuckVault] = useState<{ recipient: string; tokenMint: string } | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<"idle" | "loading" | "done">("idle");
  const presets = getPresets();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Own flag — don't borrow useStreams' `loading`, which stays true while the
  // background stream list fetches over the flaky RPC and would freeze the button.
  const [submitting, setSubmitting] = useState(false);

  const [tokenSymbol, setTokenSymbol] = useState(COMMON_TOKENS[0]?.symbol ?? "mUSDC");
  const [selectedPreset, setSelectedPreset] = useState<StreamPreset>(presets[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Optional cliff date. Empty = let the preset's default cliff timing apply
  // (startTime + 25% of duration). Set = honor the user's pick verbatim.
  const [cliffDate, setCliffDate] = useState("");
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

  // The date picker yields midnight of the chosen day, which for "today" is
  // already in the past — the program rejects start_time < now. Clamp to a
  // small buffer ahead of now so the tx is still valid by the time it lands.
  // Generous local buffer so the start stays ahead of the validator clock
  // (devnet drift + slow send) without spending an RPC call to read chain time.
  const START_BUFFER = 300; // 5 min
  const effectiveStart = () => {
    const raw = Math.floor(new Date(startDate).getTime() / 1000);
    return Math.max(raw, Math.floor(Date.now() / 1000) + START_BUFFER);
  };

  // Resolve the cliff timestamp: user-picked date wins if it's a valid value in
  // [start, end]; otherwise fall back to the preset default (25% into stream).
  const resolveCliffTime = (start: number, end: number, defaultCliff: number) => {
    if (!cliffDate) return defaultCliff;
    const picked = Math.floor(new Date(cliffDate).getTime() / 1000);
    if (Number.isNaN(picked)) return defaultCliff;
    // Program requires cliff >= start && cliff <= end. Clamp silently.
    return Math.min(Math.max(picked, start), end);
  };

  const getSplit = (amount: string, startOverride?: number) => {
    if (!amount || !startDate || !endDate) return null;
    const start = startOverride ?? effectiveStart();
    const end = Math.floor(new Date(endDate).getTime() / 1000);
    if (start >= end) return null;
    const split = calculateStreamSplit(parseFloat(amount), start, end, selectedPreset);
    return { ...split, cliffTime: resolveCliffTime(start, end, split.cliffTime) };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validRecipients.length === 0 || !startDate || !endDate) return;

    const end = Math.floor(new Date(endDate).getTime() / 1000);
    const tokenMint = COMMON_TOKENS.find((t) => t.symbol === tokenSymbol)?.mint || COMMON_TOKENS[0].mint;

    setSubmitError(null);
    setStuckVault(null);
    setSubmitting(true);
    try {
      const start = effectiveStart();
      for (const r of validRecipients) {
        const split = getSplit(r.amount, start);
        if (!split) continue;
        const signature = await handleCreateStream({
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
        // Founder history entry. Stored as UI float amount (no decimals math
        // needed) since this is a display log, not a settlement record.
        try {
          const key = `nirvana:founder-history:${user?.wallet?.address ?? "unknown"}`;
          const prev = JSON.parse(localStorage.getItem(key) ?? "[]");
          const entry = {
            type: "create" as const,
            signature,
            recipient: r.address.trim(),
            amount: r.amount,
            tokenSymbol,
            timestamp: Date.now(),
          };
          localStorage.setItem(key, JSON.stringify([entry, ...prev].slice(0, 200)));
        } catch {
          // localStorage errors shouldn't block the flow.
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
      // Surface the stuck-vault action when the friendly message matches.
      if (msg.toLowerCase().includes("vault to this recipient still exists")) {
        // Best-effort: stash the recipient that was being submitted when it failed.
        // We can't perfectly identify which row blew up in a multi-recipient batch,
        // so cache the first valid recipient as the candidate.
        const failed = validRecipients[0];
        if (failed) {
          setStuckVault({ recipient: failed.address.trim(), tokenMint });
        }
      }
      return; // stay on the form so the user can fix and retry
    } finally {
      setSubmitting(false);
    }

    router.push("/dashboard/founder");
  };

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight">Create Streams</h1>
          <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
            Pay multiple team members with one setup
          </p>
        </div>
        <FaucetButton />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Token</label>
                  <select
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value)}
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-mint/40 transition-colors appearance-none cursor-pointer"
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
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-3 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-mint/40 transition-colors appearance-none cursor-pointer"
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
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-mint/40 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-mint/40 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">
                    Cliff <span className="text-on-surface-variant/40">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={cliffDate}
                    onChange={(e) => setCliffDate(e.target.value)}
                    min={startDate || undefined}
                    max={endDate || undefined}
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-mint/40 transition-colors"
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
                  <div key={r.id} className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="font-mono text-xs text-on-surface-variant/30 w-4 shrink-0">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      value={r.address}
                      onChange={(e) => updateRecipient(r.id, "address", e.target.value)}
                      placeholder="Recipient wallet address"
                      className="flex-1 min-w-[160px] bg-surface-1 border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-mint/40 transition-colors"
                    />
                    <input
                      type="number"
                      value={r.amount}
                      onChange={(e) => updateRecipient(r.id, "amount", e.target.value)}
                      placeholder="Amount"
                      step="any"
                      min="0"
                      className="w-full sm:w-32 bg-surface-1 border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-mint/40 transition-colors"
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
                <div className="mt-4 pt-4 border-t border-hairline-soft flex items-center justify-between">
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
              <div className="font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-sm px-4 py-3 break-words space-y-3">
                <p>{submitError}</p>
                {stuckVault && (
                  <button
                    type="button"
                    disabled={releaseStatus === "loading"}
                    onClick={async () => {
                      setReleaseStatus("loading");
                      try {
                        await handleReleaseVault(stuckVault.recipient, stuckVault.tokenMint);
                        setReleaseStatus("done");
                        setSubmitError(null);
                        setStuckVault(null);
                      } catch (err) {
                        setSubmitError(err instanceof Error ? err.message : String(err));
                        setReleaseStatus("idle");
                      }
                    }}
                    className="block w-full text-center bg-mint/10 border border-mint/40 text-mint font-mono text-[11px] font-bold px-4 py-2 rounded-sm hover:bg-mint/20 transition-all uppercase tracking-widest disabled:opacity-50"
                  >
                    {releaseStatus === "loading"
                      ? "Releasing vault…"
                      : releaseStatus === "done"
                        ? "✓ Vault released — retry Create Stream"
                        : "Release stuck vault & retry"}
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || validRecipients.length === 0 || !startDate || !endDate}
              className="w-full bg-mint text-black font-mono text-sm font-bold px-8 py-4 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(47,243,200,0.2)]"
            >
              {submitting
                ? "Creating..."
                : `Create ${validRecipients.length} Stream${validRecipients.length !== 1 ? "s" : ""}`}
              {!submitting && <ChevronRight className="w-4 h-4" />}
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

                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden flex">
                    <div className="h-full bg-linear-to-r from-mint to-solana-green transition-all" style={{ width: `${selectedPreset.linearPercent}%` }} />
                    <div className="h-full bg-mint transition-all" style={{ width: `${selectedPreset.milestonePercent}%` }} />
                    <div className="h-full bg-solana-green transition-all" style={{ width: `${selectedPreset.cliffPercent}%` }} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-hairline-soft">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm bg-linear-to-r from-mint to-solana-green" />
                        <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Linear</span>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-on-surface font-bold">{totalLinear.toLocaleString()}</p>
                        <p className="font-mono text-[9px] text-on-surface-variant/50">{selectedPreset.linearPercent}%</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-hairline-soft">
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
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-hairline-soft last:border-0">
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
