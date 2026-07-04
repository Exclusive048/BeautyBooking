"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  StudioAnalyticsPeriodId,
  StudioAnalyticsViewId,
} from "../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2;

type Props = {
  period: StudioAnalyticsPeriodId;
  view: StudioAnalyticsViewId;
  compare: boolean;
};

const PERIODS: Array<{ key: StudioAnalyticsPeriodId; labelKey: keyof typeof T.periods }> = [
  { key: "7d", labelKey: "d7" },
  { key: "30d", labelKey: "d30" },
  { key: "90d", labelKey: "d90" },
  { key: "year", labelKey: "d365" },
];

const VIEWS: Array<{ key: StudioAnalyticsViewId; labelKey: keyof typeof T.views }> = [
  { key: "overview", labelKey: "overview" },
  { key: "masters", labelKey: "masters" },
  { key: "services", labelKey: "services" },
  { key: "clients", labelKey: "clients" },
];

/**
 * URL-driven controls: period (7d/30d/90d/year) + view (overview/
 * masters/services/clients) + compare toggle. Compare is only
 * meaningful on the Overview tab (KPI bar + revenue chart overlay) but
 * the toggle stays visible everywhere so the value persists across tab
 * switches.
 *
 * Custom date range picker is intentionally absent — backlogged. Per
 * spec, presets cover the validation surface.
 */
export function AnalyticsControls({ period, view, compare }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.periodLabel}
        </span>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => updateParam("period", p.key === "30d" ? null : p.key)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-accent-text"
                    : "border-border-subtle bg-bg-card text-text-sec hover:text-text-main",
                )}
              >
                {T.periods[p.labelKey]}
              </button>
            );
          })}
        </div>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-text-sec">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => updateParam("compare", e.target.checked ? "on" : "off")}
            className="h-3.5 w-3.5 rounded border-border-subtle accent-primary"
          />
          {T.compare}
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {VIEWS.map((v) => {
          const active = view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => updateParam("view", v.key === "overview" ? null : v.key)}
              aria-pressed={active}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-accent-text"
                  : "border-border-subtle bg-bg-card text-text-main hover:bg-bg-input/60",
              )}
            >
              {T.views[v.labelKey]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
