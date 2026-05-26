export interface StreamPreset {
  name: string;
  label: string;
  linearPercent: number;
  milestonePercent: number;
  cliffPercent: number;
  description: string;
}

const PRESETS_KEY = "nirvana_stream_presets";

export const DEFAULT_PRESETS: StreamPreset[] = [
  {
    name: "balanced",
    label: "Balanced",
    linearPercent: 50,
    milestonePercent: 30,
    cliffPercent: 20,
    description:
      "Half your tokens flow steadily as salary. 30% unlocks when project milestones are hit. 20% held safely until the cliff date passes. Best for most teams.",
  },
  {
    name: "conservative",
    label: "Conservative",
    linearPercent: 70,
    milestonePercent: 10,
    cliffPercent: 20,
    description:
      "70% paid as steady income — maximum cashflow security for builders. Only 10% tied to milestones. 20% cliff buffer. Ideal for risk-averse teams.",
  },
  {
    name: "aggressive",
    label: "Aggressive",
    linearPercent: 30,
    milestonePercent: 50,
    cliffPercent: 20,
    description:
      "Only 30% base pay. 50% locked behind milestones — big upside for high performers who deliver. 20% cliff buffer. For performance-driven teams.",
  },
];

export function getPresets(): StreamPreset[] {
  if (typeof window === "undefined") return DEFAULT_PRESETS;
  const stored = localStorage.getItem(PRESETS_KEY);
  if (!stored) return DEFAULT_PRESETS;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_PRESETS;
}

export function savePresets(presets: StreamPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export interface StreamSplit {
  linearAmount: number;
  milestoneAmount: number;
  cliffAmount: number;
  cliffTime: number;
}

export function calculateStreamSplit(
  totalAmount: number,
  startTime: number,
  endTime: number,
  preset: StreamPreset
): StreamSplit {
  const duration = endTime - startTime;
  const cliffDuration = Math.floor(duration * 0.25);

  return {
    linearAmount: totalAmount * (preset.linearPercent / 100),
    milestoneAmount: totalAmount * (preset.milestonePercent / 100),
    cliffAmount: totalAmount * (preset.cliffPercent / 100),
    cliffTime: startTime + cliffDuration,
  };
}
