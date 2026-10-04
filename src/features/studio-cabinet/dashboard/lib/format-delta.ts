import { UI_FMT } from "@/lib/ui/fmt";

export type DeltaTone = "positive" | "negative" | "neutral";

export type FormattedDelta = {
  text: string;
  tone: DeltaTone;
  /**
   * MOBILE-STUDIO-C (ops): то же изменение числом — для приложения, которое
   * форматирует само. Проценты / п.п. — целые, рейтинг — с одним знаком;
   * `null` — сравнивать не с чем (прошлое значение 0).
   */
  value: number | null;
};

/**
 * Computes a relative-percent delta between two numeric values and
 * formats it for display ("+18%" / "−4%" / "0%"). Returns a neutral
 * tone when the previous value is 0 (no meaningful comparison) or
 * when both values are 0.
 */
export function formatRelativeDelta(current: number, previous: number): FormattedDelta {
  // FIX-VISUAL-POLISH I9: no-change / no-baseline reads as a clean "—" (not
  // "0%") so the neutral KPI pill doesn't render a meaningless trailing value.
  if (previous === 0) {
    return { text: "—", tone: "neutral", value: null };
  }
  const ratio = (current - previous) / Math.abs(previous);
  // `+ 0` — без «−0» в JSON.
  const percent = Math.round(ratio * 100) + 0;
  if (percent === 0) return { text: "—", tone: "neutral", value: 0 };
  const sign = percent > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(percent)}%`,
    tone: percent > 0 ? "positive" : "negative",
    value: percent,
  };
}

/**
 * Absolute-points delta — used for percentage KPIs ("Загрузка студии")
 * where relative-percent comparison reads awkwardly ("+25% к 78% =
 * 97%?"). Display "+6 п.п." instead.
 */
export function formatPointsDelta(current: number, previous: number): FormattedDelta {
  const diff = Math.round(current - previous) + 0;
  if (diff === 0) return { text: "—", tone: "neutral", value: 0 };
  const sign = diff > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(diff)} п.п.`,
    tone: diff > 0 ? "positive" : "negative",
    value: diff,
  };
}

/**
 * Single-decimal rating delta ("+0.1" / "−0.2"). Returns neutral on
 * zero change.
 */
export function formatRatingDelta(current: number, previous: number): FormattedDelta {
  const diff = Math.round((current - previous) * 10) / 10 + 0;
  if (diff === 0) return { text: "—", tone: "neutral", value: 0 };
  const sign = diff > 0 ? "+" : "−";
  return {
    text: `${sign}${UI_FMT.decimal(Math.abs(diff), 1)}`,
    tone: diff > 0 ? "positive" : "negative",
    value: diff,
  };
}
