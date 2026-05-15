"use client";

import { useState, useTransition } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import {
  STUDIO_DASHBOARD_PERIODS,
  type StudioDashboardPeriodId,
} from "../lib/period-options";
import type { StudioRevenueChartData } from "../server/types";

const T = UI_TEXT.studioCabinet.dashboardV2.revenueChart;

type Props = {
  initialData: StudioRevenueChartData;
  initialPeriod?: StudioDashboardPeriodId;
};

export function StudioRevenueChart({
  initialData,
  initialPeriod = "30d",
}: Props) {
  const [period, setPeriod] = useState<StudioDashboardPeriodId>(initialPeriod);
  const [data, setData] = useState<StudioRevenueChartData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (next: StudioDashboardPeriodId) => {
    if (next === period) return;
    setPeriod(next);
    if (next === initialPeriod) {
      setData(initialData);
      setError(null);
      return;
    }
    setError(null);
    startTransition(() => {
      void fetch(`/api/studio/dashboard/revenue?period=${next}`)
        .then((response) => {
          if (!response.ok) throw new Error("HTTP error");
          return response.json();
        })
        .then((body: { data: StudioRevenueChartData }) => {
          setData(body.data);
        })
        .catch(() => {
          setError(T.error);
        });
    });
  };

  const maxRevenue = Math.max(...data.points.map((p) => p.revenueKopeks), 1);
  const sortedPoints = [...data.points].sort(
    (a, b) => b.revenueKopeks - a.revenueKopeks,
  );

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight text-text-main">
            {T.title}
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums text-text-main">
              {UI_FMT.priceLabel(data.totalKopeks)}
            </span>
            <span className="text-xs text-text-sec">{T.totalLabel}</span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-bg-page p-1">
          {STUDIO_DASHBOARD_PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handlePeriodChange(option.id)}
              disabled={isPending && option.id !== period}
              className={cn(
                "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
                option.id === period
                  ? "bg-bg-card text-text-main shadow-card"
                  : "bg-transparent text-text-sec hover:text-text-main",
              )}
              aria-pressed={option.id === period}
            >
              {T.periodSelector[option.id]}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : data.points.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <BarChart3 className="h-10 w-10 text-text-sec/30" aria-hidden />
          <p className="text-sm text-text-sec">{T.empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-busy={isPending}>
          {sortedPoints.map((point) => {
            const barWidth = (point.revenueKopeks / maxRevenue) * 100;
            return (
              <li key={point.masterId}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-text-main">
                    {point.masterName}
                  </span>
                  <span className="font-display text-sm font-semibold tabular-nums text-text-main">
                    {UI_FMT.priceLabel(point.revenueKopeks)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg-input">
                  <div
                    className="h-full rounded-full bg-brand-gradient transition-all duration-300"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-text-sec">
                  {T.bookingsTemplate.replace(
                    "{count}",
                    String(point.bookingsCount),
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
