"use client";

import { useState, useEffect } from "react";
import {
  getPresets,
  savePresets,
  DEFAULT_PRESETS,
  type StreamPreset,
} from "@/lib/stream-calculator";
import { motion, AnimatePresence } from "motion/react";
import { Sliders, Plus, Trash2, RotateCcw, X } from "lucide-react";

export default function PresetsPage() {
  const [presets, setPresets] = useState<StreamPreset[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setPresets(getPresets());
  }, []);

  const handleUpdate = (index: number, field: keyof StreamPreset, value: string | number) => {
    setPresets((prev) => {
      const next = prev.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      );
      savePresets(next);
      return next;
    });
  };

  const handleDelete = (index: number) => {
    if (presets.length <= 1) return;
    const next = presets.filter((_, i) => i !== index);
    setPresets(next);
    savePresets(next);
  };

  const handleReset = () => {
    setPresets(DEFAULT_PRESETS);
    savePresets(DEFAULT_PRESETS);
  };

  const totalPercent = (p: StreamPreset) => p.linearPercent + p.milestonePercent + p.cliffPercent;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight">Customize Presets</h1>
          <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
            Configure auto-split ratios for stream creation
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 border border-hairline text-on-surface-variant font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-surface-2 transition-all uppercase"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Defaults
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-mint text-black font-mono text-xs font-bold px-4 py-2 rounded-sm hover:brightness-110 transition-all uppercase"
          >
            <Plus className="w-3 h-3" />
            Add Preset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {presets.map((preset, index) => {
          const total = totalPercent(preset);
          const isValid = total === 100;
          return (
            <motion.div
              key={`${preset.name}_${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`glass-plate rounded-lg p-6 ${!isValid ? "border-red-400/20" : ""}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Sliders className="w-5 h-5 text-mint" />
                  <input
                    type="text"
                    value={preset.label}
                    onChange={(e) => handleUpdate(index, "label", e.target.value)}
                    className="bg-transparent border-none focus:ring-0 font-headline text-lg font-bold text-on-surface p-0 focus:outline-none"
                  />
                  <span className="font-mono text-[10px] text-on-surface-variant/40">
                    {preset.name}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {!isValid && (
                    <span className="font-mono text-[10px] text-red-400 uppercase tracking-widest">
                      Total: {total}% (must be 100%)
                    </span>
                  )}
                  {presets.length > 1 && (
                    <button
                      onClick={() => handleDelete(index)}
                      className="p-2 text-on-surface-variant/40 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Linear %</label>
                  <input
                    type="number"
                    value={preset.linearPercent}
                    onChange={(e) => handleUpdate(index, "linearPercent", parseInt(e.target.value) || 0)}
                    min={0} max={100}
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-mint focus:outline-none focus:border-mint/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Milestone %</label>
                  <input
                    type="number"
                    value={preset.milestonePercent}
                    onChange={(e) => handleUpdate(index, "milestonePercent", parseInt(e.target.value) || 0)}
                    min={0} max={100}
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-mint focus:outline-none focus:border-mint/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Cliff Buffer %</label>
                  <input
                    type="number"
                    value={preset.cliffPercent}
                    onChange={(e) => handleUpdate(index, "cliffPercent", parseInt(e.target.value) || 0)}
                    min={0} max={100}
                    className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-mint focus:outline-none focus:border-mint/40 transition-colors"
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden flex">
                  <div className="h-full bg-linear-to-r from-mint to-solana-green transition-all" style={{ width: `${preset.linearPercent}%` }} />
                  <div className="h-full bg-mint transition-all" style={{ width: `${preset.milestonePercent}%` }} />
                  <div className="h-full bg-solana-green transition-all" style={{ width: `${preset.cliffPercent}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="font-mono text-[10px] text-on-surface-variant/50">Linear</span>
                  <span className="font-mono text-[10px] text-on-surface-variant/50">Milestone</span>
                  <span className="font-mono text-[10px] text-on-surface-variant/50">Cliff</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {showForm && (
          <AddPresetForm
            onClose={() => setShowForm(false)}
            onSave={(p) => {
              setPresets((prev) => {
                const next = [...prev, p];
                savePresets(next);
                return next;
              });
              setShowForm(false);
            }}
            existingNames={presets.map((p) => p.name)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddPresetForm({
  onClose,
  onSave,
  existingNames,
}: {
  onClose: () => void;
  onSave: (p: StreamPreset) => void;
  existingNames: string[];
}) {
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [linear, setLinear] = useState(50);
  const [milestone, setMilestone] = useState(30);
  const [cliff, setCliff] = useState(20);
  const [error, setError] = useState("");

  const total = linear + milestone + cliff;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!label.trim()) { setError("Label is required"); return; }
    if (!name.trim()) { setError("Internal name is required"); return; }
    if (!/^[a-z0-9_]+$/.test(name)) { setError("Name: only lowercase letters, numbers, underscores"); return; }
    if (existingNames.includes(name)) { setError("This name already exists"); return; }
    if (total !== 100) { setError(`Percentages must total 100% (currently ${total}%)`); return; }

    onSave({
      name: name.trim(),
      label: label.trim(),
      linearPercent: linear,
      milestonePercent: milestone,
      cliffPercent: cliff,
      description: `${label.trim()}: ${linear}% linear salary, ${milestone}% milestone bonus, ${cliff}% cliff buffer.`,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-plate rounded-lg p-8 w-full max-w-lg border-mint/20"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline text-xl font-bold tracking-tight">New Preset</h3>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:text-mint transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">
                Display Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My Custom Split"
                className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-mint/40 transition-colors"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">
                Internal Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="my_custom_split"
                className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-mint/40 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Linear %</label>
              <input
                type="number"
                value={linear}
                onChange={(e) => setLinear(parseInt(e.target.value) || 0)}
                min={0} max={100}
                className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-mint focus:outline-none focus:border-mint/40 transition-colors"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Milestone %</label>
              <input
                type="number"
                value={milestone}
                onChange={(e) => setMilestone(parseInt(e.target.value) || 0)}
                min={0} max={100}
                className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-mint focus:outline-none focus:border-mint/40 transition-colors"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-2">Cliff %</label>
              <input
                type="number"
                value={cliff}
                onChange={(e) => setCliff(parseInt(e.target.value) || 0)}
                min={0} max={100}
                className="w-full bg-surface-1 border border-hairline rounded-sm px-4 py-3 font-mono text-sm text-mint focus:outline-none focus:border-mint/40 transition-colors"
              />
            </div>
          </div>

          <div className="h-2 bg-surface-2 rounded-full overflow-hidden flex">
            <div className="h-full bg-linear-to-r from-mint to-solana-green transition-all" style={{ width: `${linear}%` }} />
            <div className="h-full bg-mint transition-all" style={{ width: `${milestone}%` }} />
            <div className="h-full bg-solana-green transition-all" style={{ width: `${cliff}%` }} />
          </div>

          {error && (
            <p className="font-mono text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!label || !name}
            className="w-full bg-mint text-black font-mono text-sm font-bold px-8 py-4 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Preset
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
