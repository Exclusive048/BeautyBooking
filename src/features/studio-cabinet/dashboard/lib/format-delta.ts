export type DeltaTone = "positive" | "negative" | "neutral";

export type FormattedDelta = {
  text: string;
  tone: DeltaTone;
};

/**
 * Computes a relative-percent delta between two numeric values and
 * formats it for display ("+18%" / "−4%" / "0%"). Returns a neutral
 * tone when the previous value is 0 (no meaningful comparison) or
 * when both values are 0.
 */
export function formatRelativeDelta(current: number, previous: number): FormattedDelta {
  if (previous === 0) {
    if (current === 0) return { text: "0%", tone: "neutral" };
    return { text: "—", tone: "neutral" };
  }
  const ratio = (current - previous) / Math.abs(previous);
  const percent = Math.round(ratio * 100);
  if (percent === 0) return { text: "0%", tone: "neutral" };
  const sign = percent > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(percent)}%`,
    tone: percent > 0 ? "positive" : "negative",
  };
}

/**
 * Absolute-points delta — used for percentage KPIs ("Загрузка студии")
 * where relative-percent comparison reads awkwardly ("+25% к 78% =
 * 97%?"). Display "+6 п.п." instead.
 */
export function formatPointsDelta(current: number, previous: number): FormattedDelta {
  const diff = Math.round(current - previous);
  if (diff === 0) return { text: "0 п.п.", tone: "neutral" };
  const sign = diff > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(diff)} п.п.`,
    tone: diff > 0 ? "positive" : "negative",
  };
}

/**
 * Single-decimal rating delta ("+0.1" / "−0.2"). Returns neutral on
 * zero change.
 */
export function formatRatingDelta(current: number, previous: number): FormattedDelta {
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { text: "0.0", tone: "neutral" };
  const sign = diff > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(diff).toFixed(1)}`,
    tone: diff > 0 ? "positive" : "negative",
  };
}
