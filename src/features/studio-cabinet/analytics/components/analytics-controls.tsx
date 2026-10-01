"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  StudioAnalyticsPeriodId,
  StudioAnalyticsViewId,
} from "../lib/types";
import { Tabs } from "@/components/ui/tabs";

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
        <span className="eyebrow">
          {T.periodLabel}
        </span>
        <Tabs
          ariaLabel={T.periodLabel}
          items={PERIODS.map((p) => ({ id: p.key, label: T.periods[p.labelKey] }))}
          value={period}
          onChange={(id) => updateParam("period", id === "30d" ? null : id)}
        />
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-text-sec">
          <Checkbox
            size="sm"
            checked={compare}
            onChange={(e) => updateParam("compare", e.target.checked ? "on" : "off")}
          />
          {T.compare}
        </label>
      </div>
      <Tabs
        ariaLabel={T.viewsAria}
        items={VIEWS.map((v) => ({ id: v.key, label: T.views[v.labelKey] }))}
        value={view}
        onChange={(id) => updateParam("view", id === "overview" ? null : id)}
      />
    </div>
  );
}
