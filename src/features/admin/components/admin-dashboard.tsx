"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type MetricsResponse = {
  registrationsToday: {
    clients: number;
    pros: number;
    total: number;
  };
  bookingsLast24h: number;
  profileViewsLast24h: number | null;
  conversion: number | null;
  conversionNote?: string;
  activeSubscriptions: number;
};

export function AdminDashboard() {
  const t = UI_TEXT.admin.dashboard;
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
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
      }
    };

    void load();
  }, [t.errors.loadMetrics]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
      </header>

      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}

      {data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">{t.cards.registrationsToday}</div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between">
                <div className="text-3xl font-semibold text-text-main">{data.registrationsToday.total}</div>
                <div className="text-xs text-text-sec">{t.totalLabel}</div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-text-sec">
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
              <div className="text-3xl font-semibold text-text-main">{data.bookingsLast24h}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">{t.cards.conversion}</div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-semibold text-text-main">
                {data.conversion == null ? "—" : `${(data.conversion * 100).toFixed(1)}%`}
              </div>
              <div className="text-xs text-text-sec">
                {data.conversion == null ? data.conversionNote : t.conversionPeriod}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">{t.cards.activeSubscriptions}</div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-text-main">{data.activeSubscriptions}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
