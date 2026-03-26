"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/Skeleton";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { cn } from "@/lib/cn";
import { moneyRUBFromKopeks, moneyRUBPlainFromKopeks } from "@/lib/format";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type Scope = "MASTER" | "STUDIO";

type Range = {
  from: string;
  to: string;
};

type KpiMetric = {
  value: number;
  delta: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
};

type DashboardResponse = {
  range: Range;
  compareRange: Range | null;
  kpi: {
    revenue: KpiMetric;
    bookingsCount: KpiMetric;
    uniqueClients: KpiMetric;
    returnRate: KpiMetric;
    avgCheck: KpiMetric;
    cancellationRate: KpiMetric;
    noShowRate: KpiMetric;
    occupancyRate: KpiMetric;
  };
  occupancy: Array<{
    weekday: number;
    label: string;
    bookedMinutes: number;
    capacityMinutes: number | null;
    rate: number | null;
  }>;
  revenueTimeline: {
    granularity: "day" | "week" | "month";
    points: Array<{
      date: string;
      revenue: number;
      bookings: number;
      clients: number;
      avgCheck: number;
    }>;
  };
};

type RevenueByService = {
  totalRevenue: number;
  rows: Array<{ key: string; label: string; revenue: number; bookings: number; share: number }>;
};

type RevenueByMaster = {
  totalRevenue: number;
  rows: Array<{ masterId: string; masterName: string; revenue: number; bookings: number; share: number }>;
};

type RevenueForecast = {
  month: string;
  plannedRevenue: number;
  historicalCancelRate: number;
  forecastRevenue: number;
};

type ClientsSegments = {
  segments: {
    new: number;
    returning: number;
    loyal: number;
    sleeping: number;
    lost: number;
  };
  topClients: Array<{ clientId: string; revenue: number; visits: number; lastVisit: string | null }>;
};

type ClientsLtv = {
  summary: {
    avgRevenue: number;
    medianRevenue: number;
    avgVisits: number;
    avgLifespanDays: number;
  };
};

type ClientsNewReturning = {
  granularity: "day" | "week" | "month";
  points: Array<{ date: string; newClients: number; returningClients: number }>;
};

type ClientsAtRisk = {
  thresholdDays: number;
  clients: Array<{ clientId: string; lastVisit: string | null; avgIntervalDays: number; daysSinceLast: number }>;
};

type BookingsFunnel = {
  created: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  confirmedRate: number;
  completedRate: number;
  cancelRate: number;
  noShowRate: number;
};

type BookingsHeatmap = {
  cells: Array<{ day: number; hour: number; count: number }>;
};

type BookingsLeadTime = {
  buckets: Array<{ key: string; label: string; count: number }>;
};

type CohortResult = {
  monthsBack: number;
  cohorts: Array<{ cohort: string; size: number; values: number[] }>;
  summary: { avgM1: number; avgM3: number; bestM1Cohort: string | null };
};

const PERIODS: Array<{ id: string; label: string }> = [
  { id: "today", label: "Сегодня" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "quarter", label: "Квартал" },
  { id: "custom", label: "Период" },
];

const TABS: TabItem[] = [
  { id: "overview", label: "Обзор" },
  { id: "revenue", label: "Выручка" },
  { id: "clients", label: "Клиенты" },
  { id: "bookings", label: "Записи" },
  { id: "cohorts", label: "Когорты" },
];

const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const SEGMENT_LABELS: Record<string, string> = {
  new: "Новые",
  returning: "Возвращающиеся",
  loyal: "Лояльные",
  sleeping: "Спящие",
  lost: "Потерянные",
};

function formatPercent(value: number | null, suffix = "%") {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}${suffix}`;
}

function formatDelta(metric: KpiMetric) {
  if (metric.deltaPct === null) return "—";
  const sign = metric.deltaPct > 0 ? "+" : metric.deltaPct < 0 ? "−" : "";
  return `${sign}${Math.round(Math.abs(metric.deltaPct) * 100)}%`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json || !json.ok) {
    const message = json && !json.ok ? json.error.message : `Ошибка API: ${res.status}`;
    throw new Error(message);
  }
  return json.data;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="text-base font-semibold text-text-main">{title}</div>
      {subtitle ? <div className="text-xs text-text-sec">{subtitle}</div> : null}
    </div>
  );
}

function BarRow({ label, value, max, right }: { label: string; value: number; max: number; right?: string }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-xs text-text-sec">
      <div className="w-10 shrink-0">{label}</div>
      <div className="flex-1 rounded-full bg-bg-input">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
      <div className="w-12 text-right text-text-main">{right ?? value}</div>
    </div>
  );
}

export function AnalyticsPage({ scope }: { scope: Scope }) {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [compare, setCompare] = useState(false);
  const [masterId, setMasterId] = useState("");
  const [masters, setMasters] = useState<Array<{ id: string; name: string }>>([]);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [revenue, setRevenue] = useState<{
    timeline: DashboardResponse["revenueTimeline"] | null;
    byService: RevenueByService | null;
    byMaster: RevenueByMaster | null;
    forecast: RevenueForecast | null;
  }>({ timeline: null, byService: null, byMaster: null, forecast: null });
  const [clients, setClients] = useState<{
    segments: ClientsSegments | null;
    ltv: ClientsLtv | null;
    newReturning: ClientsNewReturning | null;
    atRisk: ClientsAtRisk | null;
  }>({ segments: null, ltv: null, newReturning: null, atRisk: null });
  const [bookings, setBookings] = useState<{
    funnel: BookingsFunnel | null;
    heatmap: BookingsHeatmap | null;
    leadTime: BookingsLeadTime | null;
  }>({ funnel: null, heatmap: null, leadTime: null });
  const [cohorts, setCohorts] = useState<{ retention: CohortResult | null; revenue: CohortResult | null }>({
    retention: null,
    revenue: null,
  });

  const timeline = revenue.timeline;
  const byService = revenue.byService;
  const byMaster = revenue.byMaster;
  const newReturning = clients.newReturning;
  const leadTime = bookings.leadTime;

  const baseParams = useMemo(() => {
    const params = new URLSearchParams({ scope });
    if (scope === "STUDIO" && masterId) {
      params.set("masterId", masterId);
    }
    return params;
  }, [scope, masterId]);

  const loadMasters = useCallback(async () => {
    if (scope !== "STUDIO") return;
    try {
      const data = await fetchJson<{ masters: Array<{ id: string; name: string }> }>(
        `/api/analytics/masters?scope=STUDIO`
      );
      setMasters(data.masters);
    } catch {
      setMasters([]);
    }
  }, [scope]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const params = new URLSearchParams(baseParams);
      params.set("period", period);
      if (period === "custom") {
        if (customFrom) params.set("from", customFrom);
        if (customTo) params.set("to", customTo);
      }
      if (compare) params.set("compare", "1");
      const data = await fetchJson<DashboardResponse>(`/api/analytics/dashboard?${params.toString()}`);
      setDashboard(data);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Не удалось загрузить аналитику.");
      setDashboard(null);
    } finally {
      setDashboardLoading(false);
    }
  }, [baseParams, compare, customFrom, customTo, period]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const range = dashboard?.range;

  useEffect(() => {
    if (tab !== "revenue" || !range) return;
    const params = new URLSearchParams(baseParams);
    params.set("from", range.from);
    params.set("to", range.to);

    void Promise.all([
      fetchJson<DashboardResponse["revenueTimeline"]>(`/api/analytics/revenue/timeline?${params.toString()}`),
      fetchJson<RevenueByService>(`/api/analytics/revenue/by-service?${params.toString()}`),
      scope === "STUDIO"
        ? fetchJson<RevenueByMaster>(`/api/analytics/revenue/by-master?${params.toString()}`)
        : Promise.resolve(null),
      fetchJson<RevenueForecast>(
        `/api/analytics/revenue/forecast?${params.toString()}&month=${range.from.slice(0, 7)}`
      ).catch(() => null),
    ])
      .then(([timeline, byService, byMaster, forecast]) => {
        setRevenue({ timeline, byService, byMaster, forecast });
      })
      .catch(() => {
        setRevenue({ timeline: null, byService: null, byMaster: null, forecast: null });
      });
  }, [baseParams, range, scope, tab]);

  useEffect(() => {
    if (tab !== "clients" || !range) return;
    const params = new URLSearchParams(baseParams);
    params.set("from", range.from);
    params.set("to", range.to);

    void Promise.all([
      fetchJson<ClientsSegments>(`/api/analytics/clients/segments?${params.toString()}`),
      fetchJson<ClientsLtv>(`/api/analytics/clients/ltv?${params.toString()}`),
      fetchJson<ClientsNewReturning>(`/api/analytics/clients/new-vs-returning?${params.toString()}`),
      fetchJson<ClientsAtRisk>(`/api/analytics/clients/at-risk?${params.toString()}`),
    ])
      .then(([segments, ltv, newReturning, atRisk]) => {
        setClients({ segments, ltv, newReturning, atRisk });
      })
      .catch(() => {
        setClients({ segments: null, ltv: null, newReturning: null, atRisk: null });
      });
  }, [baseParams, range, tab]);

  useEffect(() => {
    if (tab !== "bookings" || !range) return;
    const params = new URLSearchParams(baseParams);
    params.set("from", range.from);
    params.set("to", range.to);

    void Promise.all([
      fetchJson<BookingsFunnel>(`/api/analytics/bookings/funnel?${params.toString()}`),
      fetchJson<BookingsHeatmap>(`/api/analytics/bookings/heatmap?${params.toString()}`),
      fetchJson<BookingsLeadTime>(`/api/analytics/bookings/lead-time?${params.toString()}`),
    ])
      .then(([funnel, heatmap, leadTime]) => {
        setBookings({ funnel, heatmap, leadTime });
      })
      .catch(() => {
        setBookings({ funnel: null, heatmap: null, leadTime: null });
      });
  }, [baseParams, range, tab]);

  useEffect(() => {
    if (tab !== "cohorts") return;
    const params = new URLSearchParams(baseParams);
    void Promise.all([
      fetchJson<CohortResult>(`/api/analytics/cohorts/retention?${params.toString()}`),
      fetchJson<CohortResult>(`/api/analytics/cohorts/revenue?${params.toString()}`),
    ])
      .then(([retention, revenueData]) => {
        setCohorts({ retention, revenue: revenueData });
      })
      .catch(() => {
        setCohorts({ retention: null, revenue: null });
      });
  }, [baseParams, tab]);

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-main">Аналитика</h1>
            <p className="text-sm text-text-sec">
              Выручка, клиенты и динамика бронирований в одном месте.
            </p>
          </div>
          {scope === "STUDIO" ? (
            <div className="w-full max-w-[260px]">
              <Select value={masterId} onChange={(event) => setMasterId(event.target.value)}>
                <option value="">Все мастера</option>
                {masters.map((master) => (
                  <option key={master.id} value={master.id}>
                    {master.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            items={PERIODS.map((item) => ({ id: item.id, label: item.label }))}
            value={period}
            onChange={setPeriod}
          />
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-xs">
            <span>Сравнить</span>
            <Switch checked={compare} onCheckedChange={setCompare} />
          </div>
        </div>

        {period === "custom" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </div>
        ) : null}
      </header>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {dashboardError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{dashboardError}</div>
      ) : null}

      {tab === "overview" ? (
        <FeatureGate feature="analytics_dashboard" requiredPlan="FREE" scope={scope}>
          {dashboardLoading || !dashboard ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  { label: "Выручка", value: moneyRUBFromKopeks(dashboard.kpi.revenue.value), delta: dashboard.kpi.revenue },
                  { label: "Записи", value: dashboard.kpi.bookingsCount.value, delta: dashboard.kpi.bookingsCount },
                  { label: "Клиенты", value: dashboard.kpi.uniqueClients.value, delta: dashboard.kpi.uniqueClients },
                  { label: "Средний чек", value: moneyRUBPlainFromKopeks(dashboard.kpi.avgCheck.value), delta: dashboard.kpi.avgCheck },
                ].map((item) => (
                  <div key={item.label} className="lux-card rounded-[22px] p-4">
                    <div className="text-xs text-text-sec">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-text-main">{item.value}</div>
                    <div className="mt-1 text-xs text-text-sec">Δ {formatDelta(item.delta)}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: "Возврат", value: formatPercent(dashboard.kpi.returnRate.value), delta: dashboard.kpi.returnRate },
                  { label: "Отмены", value: formatPercent(dashboard.kpi.cancellationRate.value), delta: dashboard.kpi.cancellationRate },
                  { label: "Неявки", value: formatPercent(dashboard.kpi.noShowRate.value), delta: dashboard.kpi.noShowRate },
                ].map((item) => (
                  <div key={item.label} className="lux-card rounded-[22px] p-4">
                    <div className="text-xs text-text-sec">{item.label}</div>
                    <div className="mt-2 text-xl font-semibold text-text-main">{item.value}</div>
                    <div className="mt-1 text-xs text-text-sec">Δ {formatDelta(item.delta)}</div>
                  </div>
                ))}
              </div>

              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title="Выручка" subtitle="Динамика по выбранному периоду" />
                <div className="mt-4 space-y-2">
                  {dashboard.revenueTimeline.points.slice(-12).map((point) => (
                    <BarRow
                      key={point.date}
                      label={point.date.slice(5)}
                      value={point.revenue}
                      max={Math.max(...dashboard.revenueTimeline.points.map((p) => p.revenue), 1)}
                      right={moneyRUBPlainFromKopeks(point.revenue)}
                    />
                  ))}
                </div>
              </div>

              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title="Загрузка" subtitle="Сравнение занятости по дням недели" />
                <div className="mt-4 space-y-2">
                  {dashboard.occupancy.map((item) => (
                    <BarRow
                      key={item.weekday}
                      label={item.label}
                      value={item.bookedMinutes}
                      max={Math.max(...dashboard.occupancy.map((row) => row.bookedMinutes), 1)}
                      right={item.rate ? formatPercent(item.rate) : "—"}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </FeatureGate>
      ) : null}

      {tab === "revenue" ? (
        <FeatureGate feature="analytics_revenue" requiredPlan="PRO" scope={scope}>
          {!range ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-6">
              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title="Выручка по времени" />
                {timeline ? (
                  <div className="mt-4 space-y-2">
                    {timeline.points.slice(-12).map((point) => (
                      <BarRow
                        key={point.date}
                        label={point.date.slice(5)}
                        value={point.revenue}
                        max={Math.max(...timeline.points.map((p) => p.revenue), 1)}
                        right={moneyRUBPlainFromKopeks(point.revenue)}
                      />
                    ))}
                  </div>
                ) : (
                  <Skeleton className="mt-4 h-24 w-full" />
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="lux-card rounded-[22px] p-4">
                  <SectionHeader title="Услуги" />
                  {byService ? (
                    <div className="mt-4 space-y-2">
                      {byService.rows.slice(0, 6).map((row) => (
                        <BarRow
                          key={row.key}
                          label={row.label.slice(0, 4)}
                          value={row.revenue}
                          max={Math.max(...byService.rows.map((r) => r.revenue), 1)}
                          right={moneyRUBPlainFromKopeks(row.revenue)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Skeleton className="mt-4 h-24 w-full" />
                  )}
                </div>

                {scope === "STUDIO" ? (
                  <div className="lux-card rounded-[22px] p-4">
                    <SectionHeader title="Мастера" />
                    {byMaster ? (
                      <div className="mt-4 space-y-2">
                        {byMaster.rows.slice(0, 6).map((row) => (
                          <BarRow
                            key={row.masterId}
                            label={row.masterName.slice(0, 4)}
                            value={row.revenue}
                            max={Math.max(...byMaster.rows.map((r) => r.revenue), 1)}
                            right={moneyRUBPlainFromKopeks(row.revenue)}
                          />
                        ))}
                      </div>
                    ) : (
                      <Skeleton className="mt-4 h-24 w-full" />
                    )}
                  </div>
                ) : null}
              </div>

              <FeatureGate feature="analytics_forecast" requiredPlan="PREMIUM" scope={scope}>
                <div className="lux-card rounded-[22px] p-4">
                  <SectionHeader title="Прогноз" />
                  {revenue.forecast ? (
                    <div className="mt-3 text-sm text-text-sec">
                      Прогноз на {revenue.forecast.month}:{" "}
                      <span className="text-text-main">{moneyRUBFromKopeks(revenue.forecast.forecastRevenue)}</span>
                    </div>
                  ) : (
                    <Skeleton className="mt-3 h-6 w-40" />
                  )}
                </div>
              </FeatureGate>
            </div>
          )}
        </FeatureGate>
      ) : null}

      {tab === "clients" ? (
        <FeatureGate feature="analytics_clients" requiredPlan="PRO" scope={scope}>
          {!range ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-6">
              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title="Сегменты клиентов" />
                {clients.segments ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-5 text-xs text-text-sec">
                    {Object.entries(clients.segments.segments).map(([key, value]) => (
                      <div key={key} className="rounded-xl bg-bg-input p-3 text-center">
                        <div className="text-text-sec">{SEGMENT_LABELS[key] ?? key}</div>
                        <div className="mt-1 text-sm font-semibold text-text-main">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Skeleton className="mt-4 h-16 w-full" />
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="lux-card rounded-[22px] p-4">
                  <SectionHeader title={UI_TEXT.analytics.labels.ltv} />
                  {clients.ltv ? (
                    <div className="mt-3 text-sm text-text-sec">
                      Средняя выручка:{" "}
                      <span className="text-text-main">{moneyRUBFromKopeks(clients.ltv.summary.avgRevenue)}</span>
                    </div>
                  ) : (
                    <Skeleton className="mt-3 h-6 w-32" />
                  )}
                </div>
                <div className="lux-card rounded-[22px] p-4">
                  <SectionHeader title="Новые / возвращающиеся" />
                  {newReturning ? (
                    <div className="mt-4 space-y-2">
                      {newReturning.points.slice(-8).map((point) => (
                        <BarRow
                          key={point.date}
                          label={point.date.slice(5)}
                          value={point.newClients}
                          max={Math.max(...newReturning.points.map((p) => p.newClients), 1)}
                          right={String(point.newClients)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Skeleton className="mt-4 h-24 w-full" />
                  )}
                </div>
              </div>

              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title="Риск ухода" />
                {clients.atRisk ? (
                  <div className="mt-3 text-sm text-text-sec">
                    {clients.atRisk.clients.length === 0 ? (
                      "Нет клиентов в зоне риска."
                    ) : (
                      <ul className="space-y-1">
                        {clients.atRisk.clients.slice(0, 5).map((client) => (
                          <li key={client.clientId}>
                            Клиент {client.clientId.slice(0, 6)}… — {client.daysSinceLast} дн.
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Skeleton className="mt-3 h-8 w-full" />
                )}
              </div>
            </div>
          )}
        </FeatureGate>
      ) : null}

      {tab === "bookings" ? (
        <FeatureGate feature="analytics_booking_insights" requiredPlan="PREMIUM" scope={scope}>
          {!range ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-6">
              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title="Воронка" />
                {bookings.funnel ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-5 text-xs text-text-sec">
                    {[
                      ["Создано", bookings.funnel.created],
                      ["Подтверждено", bookings.funnel.confirmed],
                      ["Завершено", bookings.funnel.completed],
                      ["Отменено", bookings.funnel.cancelled],
                      ["Неявки", bookings.funnel.noShow],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-bg-input p-3 text-center">
                        <div>{label}</div>
                        <div className="mt-1 text-sm font-semibold text-text-main">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Skeleton className="mt-4 h-16 w-full" />
                )}
              </div>

              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title={UI_TEXT.analytics.labels.leadTime} />
                {leadTime ? (
                  <div className="mt-4 space-y-2">
                    {leadTime.buckets.map((bucket) => (
                      <BarRow
                        key={bucket.key}
                        label={bucket.label.slice(0, 4)}
                        value={bucket.count}
                        max={Math.max(...leadTime.buckets.map((b) => b.count), 1)}
                        right={String(bucket.count)}
                      />
                    ))}
                  </div>
                ) : (
                  <Skeleton className="mt-4 h-24 w-full" />
                )}
              </div>

              <div className="lux-card rounded-[22px] p-4">
                <SectionHeader title="Тепловая карта" />
                {bookings.heatmap ? (
                  <div className="mt-4 grid grid-cols-7 gap-1 text-[10px] text-text-sec">
                    {WEEKDAY_LABELS.map((label) => (
                      <div key={label} className="text-center">
                        {label}
                      </div>
                    ))}
                    {Array.from({ length: 24 }).flatMap((_, hour) =>
                      WEEKDAY_LABELS.map((_, day) => {
                        const cell = bookings.heatmap?.cells.find((item) => item.day === day && item.hour === hour);
                        const intensity = cell ? Math.min(100, cell.count * 8) : 0;
                        return (
                          <div
                            key={`${day}-${hour}`}
                            className={cn("h-6 rounded", intensity ? "bg-primary/30" : "bg-bg-input")}
                          />
                        );
                      })
                    )}
                  </div>
                ) : (
                  <Skeleton className="mt-4 h-24 w-full" />
                )}
              </div>
            </div>
          )}
        </FeatureGate>
      ) : null}

      {tab === "cohorts" ? (
        <FeatureGate feature="analytics_cohorts" requiredPlan="PREMIUM" scope={scope}>
          <div className="space-y-6">
            <div className="lux-card rounded-[22px] p-4">
              <SectionHeader title="Удержание" subtitle="Retention по когортам" />
              {cohorts.retention ? (
                <div className="mt-4 space-y-2 text-xs text-text-sec">
                  {cohorts.retention.cohorts.map((row) => (
                    <div key={row.cohort} className="flex items-center gap-3">
                      <div className="w-16">{row.cohort}</div>
                      <div className="flex flex-1 gap-1">
                        {row.values.map((value, idx) => (
                          <div
                            key={`${row.cohort}-${idx}`}
                            className="h-2 flex-1 rounded bg-primary/30"
                            style={{ opacity: Math.max(0.15, value) }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Skeleton className="mt-4 h-16 w-full" />
              )}
            </div>

            <div className="lux-card rounded-[22px] p-4">
              <SectionHeader title="Когорты выручки" />
              {cohorts.revenue ? (
                <div className="mt-4 space-y-2 text-xs text-text-sec">
                  {cohorts.revenue.cohorts.map((row) => (
                    <div key={row.cohort} className="flex items-center gap-3">
                      <div className="w-16">{row.cohort}</div>
                      <div className="flex flex-1 gap-1">
                        {row.values.map((value, idx) => (
                          <div
                            key={`${row.cohort}-${idx}`}
                            className="h-2 flex-1 rounded bg-primary/30"
                            style={{ opacity: Math.max(0.15, value) }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Skeleton className="mt-4 h-16 w-full" />
              )}
            </div>
          </div>
        </FeatureGate>
      ) : null}
    </section>
  );
}
