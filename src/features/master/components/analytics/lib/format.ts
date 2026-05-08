/**
 * Display-only formatters for the master analytics page (30a).
 *
 * Server-stable: no `Date.now()` side effects, all numerics are
 * deterministic given input. Used by both the server orchestrator
 * and small client islands (chips/toggle).
 */

const NUMBER_FMT = new Intl.NumberFormat("ru-RU");

export function formatRubles(kopeks: number | null): string {
  if (kopeks === null || !Number.isFinite(kopeks) || kopeks <= 0) return "—";
  return `${NUMBER_FMT.format(Math.round(kopeks / 100))} ₽`;
}

export function formatRublesShort(kopeks: number): string {
  // Used on the line chart's y-axis ticks: "12K", "5K". Keeps tick
  // labels readable when revenue is north of 100K rubles.
  if (!Number.isFinite(kopeks) || kopeks <= 0) return "0";
  const rubles = Math.round(kopeks / 100);
  if (rubles >= 1_000_000) return `${(rubles / 1_000_000).toFixed(1)}M`;
  if (rubles >= 1000) return `${Math.round(rubles / 1000)}K`;
  return String(rubles);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return NUMBER_FMT.format(Math.round(value));
}

export function formatPercent(
  fraction: number | null,
  options?: { signed?: boolean }
): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  const pct = Math.round(fraction * 100);
  const signed = options?.signed ?? false;
  if (signed) return `${pct >= 0 ? "+" : ""}${pct}%`;
  return `${pct}%`;
}

export function formatPercentPoints(
  diff: number | null,
  options?: { signed?: boolean }
): string {
  if (diff === null || !Number.isFinite(diff)) return "—";
  const value = Math.round(diff * 100);
  const signed = options?.signed ?? false;
  return `${signed && value >= 0 ? "+" : ""}${value} п.п.`;
}

/**
 * Heatmap intensity bucket (0-100% relative to the period's max). The
 * UI maps this to Tailwind rose tints — keeping tier resolution here
 * means the cell rendering stays declarative.
 */
export function getHeatmapTier(intensityPct: number): "empty" | "low" | "mid-low" | "mid" | "mid-high" | "high" {
  if (intensityPct <= 0) return "empty";
  if (intensityPct < 20) return "low";
  if (intensityPct < 40) return "mid-low";
  if (intensityPct < 60) return "mid";
  if (intensityPct < 80) return "mid-high";
  return "high";
}

const TIER_BG: Record<ReturnType<typeof getHeatmapTier>, string> = {
  empty: "bg-bg-input/40 dark:bg-bg-input/30",
  low: "bg-rose-100 dark:bg-rose-500/15",
  "mid-low": "bg-rose-200/80 dark:bg-rose-500/30",
  mid: "bg-rose-300 dark:bg-rose-500/45",
  "mid-high": "bg-rose-500/80 dark:bg-rose-500/70",
  high: "bg-rose-700 dark:bg-rose-500/95",
};

const TIER_TEXT: Record<ReturnType<typeof getHeatmapTier>, string> = {
  empty: "text-text-sec/40",
  low: "text-text-main",
  "mid-low": "text-text-main",
  mid: "text-text-main",
  "mid-high": "text-white",
  high: "text-white",
};

export function getHeatmapBgClass(intensityPct: number): string {
  return TIER_BG[getHeatmapTier(intensityPct)];
}

export function getHeatmapTextClass(intensityPct: number): string {
  return TIER_TEXT[getHeatmapTier(intensityPct)];
}

/**
 * Russian-pluralised period label used in the "За {period}" subtitle of
 * the top-services card. Maps the 7d/30d/90d/year IDs to short labels.
 */
export function periodLabelFor(period: "7d" | "30d" | "90d" | "year"): string {
  if (period === "7d") return "7 дней";
  if (period === "30d") return "30 дней";
  if (period === "90d") return "квартал";
  return "год";
}
