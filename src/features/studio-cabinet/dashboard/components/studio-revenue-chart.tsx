"use client";

import { useState, useTransition } from "react";
import { BarChart3 } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { fetchJsonWithAuth } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import {
  STUDIO_DASHBOARD_PERIODS,
  type StudioDashboardPeriodId,
} from "../lib/period-options";
import type { StudioRevenueChartData } from "../server/types";
import { Tabs } from "@/components/ui/tabs";

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
      // Чтение графика: отказ — своя строка поверхности (действия, кроме
      // повтора, нет).
      void fetchJsonWithAuth<StudioRevenueChartData>(`/api/studio/dashboard/revenue?period=${next}`)
        .then((data) => {
          setData(data);
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
        <Tabs
          ariaLabel={T.periodAria}
          items={STUDIO_DASHBOARD_PERIODS.map((option) => ({
            id: option.id,
            label: T.periodSelector[option.id],
            disabled: isPending && option.id !== period,
          }))}
          value={period}
          onChange={(id) => handlePeriodChange(id as StudioDashboardPeriodId)}
        />
      </header>

      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
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
                    className="h-full rounded-full bg-brand-gradient transition-all duration-200"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <p className="mt-1 text-2xs text-text-sec">
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
