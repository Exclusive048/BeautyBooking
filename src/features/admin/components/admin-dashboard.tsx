"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.admin.dashboard;

type DayPoint = { date: string; count: number };

type ActivityItem = {
  id: string;
  providerName: string;
  serviceName: string;
  status: string;
  timeIso: string;
};

type MetricsResponse = {
  registrationsToday: { clients: number; pros: number; total: number };
  bookingsLast24h: number;
  profileViewsLast24h: number | null;
  conversion: number | null;
  conversionNote: string | null;
  activeSubscriptions: number;
  registrationsLast7Days: DayPoint[];
  recentActivity: ActivityItem[];
};

// ── Sparkline chart ──────────────────────────────────────────────────────────

function SparklineChart({ data }: { data: DayPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-text-sec">
        {t.chart.noData}
      </div>
    );
  }

  const W = 400;
  const H = 80;
  const PAD_X = 4;
  const PAD_Y = 8;
  const max = Math.max(...data.map((d) => d.count), 1);

  const points = data.map((d, i) => {
    const x = PAD_X + (i / (data.length - 1 || 1)) * (W - PAD_X * 2);
    const y = PAD_Y + (1 - d.count / max) * (H - PAD_Y * 2);
    return { x, y, ...d };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill: close the path down to the baseline
  const area = [
    `M ${points[0].x},${H}`,
    ...points.map((p) => `L ${p.x},${p.y}`),
    `L ${points[points.length - 1].x},${H}`,
    "Z",
  ].join(" ");

  const formatDay = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H + 20}`}
        className="w-full"
        aria-label={t.chart.title}
        role="img"
      >
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-primary))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={area} fill="url(#spark-grad)" />

        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="rgb(var(--color-primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r="3" fill="rgb(var(--color-primary))" />
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => {
          if (i !== 0 && i !== points.length - 1 && i !== Math.floor(points.length / 2))
            return null;
          return (
            <text
              key={`lbl-${p.date}`}
              x={p.x}
              y={H + 16}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              className="text-text-sec"
            >
              {formatDay(p.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  if (status === "NEW" || status === "PENDING") return t.activity.statusNew;
  if (status === "CONFIRMED" || status === "PREPAID") return t.activity.statusConfirmed;
  if (status === "CANCELLED" || status === "REJECTED") return t.activity.statusCancelled;
  if (status === "FINISHED" || status === "IN_PROGRESS") return t.activity.statusFinished;
  return t.activity.statusOther;
}

function statusColor(status: string): string {
  if (status === "NEW" || status === "PENDING") return "text-amber-600 dark:text-amber-400";
  if (status === "CONFIRMED" || status === "PREPAID") return "text-emerald-600 dark:text-emerald-400";
  if (status === "CANCELLED" || status === "REJECTED") return "text-red-600 dark:text-red-400";
  if (status === "FINISHED" || status === "IN_PROGRESS") return "text-blue-600 dark:text-blue-400";
  return "text-text-sec";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/metrics", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<MetricsResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errors.loadMetrics);
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.loadMetrics);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
          <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label={t.refresh}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {t.refresh}
        </Button>
      </header>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          {/* Stats cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-text-main">{t.cards.registrationsToday}</div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-semibold tabular-nums text-text-main">
                  {data.registrationsToday.total}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-text-sec">
                  <span>{t.clientsLabel}: {data.registrationsToday.clients}</span>
                  <span>{t.prosLabel}: {data.registrationsToday.pros}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-text-main">{t.cards.bookingsLast24h}</div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums text-text-main">
                  {data.bookingsLast24h}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-text-main">{t.cards.conversion}</div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-3xl font-semibold tabular-nums text-text-main">
                  {data.conversion == null ? "—" : `${(data.conversion * 100).toFixed(1)}%`}
                </div>
                <div className="text-xs text-text-sec">
                  {data.conversion == null ? t.conversionNote : t.conversionPeriod}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-text-main">{t.cards.activeSubscriptions}</div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums text-text-main">
                  {data.activeSubscriptions}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">{t.chart.title}</div>
            </CardHeader>
            <CardContent>
              <SparklineChart data={data.registrationsLast7Days} />
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">{t.activity.title}</div>
            </CardHeader>
            <CardContent>
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-text-sec">{t.activity.empty}</p>
              ) : (
                <ul className="divide-y divide-border-subtle/60">
                  {data.recentActivity.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text-main">
                          {t.activity.bookingLabel(item.providerName, item.serviceName)}
                        </p>
                        <p className={`mt-0.5 text-xs font-medium ${statusColor(item.status)}`}>
                          {statusLabel(item.status)}
                        </p>
                      </div>
                      <time
                        dateTime={item.timeIso}
                        className="shrink-0 text-xs tabular-nums text-text-sec"
                      >
                        {formatTime(item.timeIso)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  );
}
