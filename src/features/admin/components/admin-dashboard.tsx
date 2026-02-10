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
          throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить метрики");
        }
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить метрики");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{UI_TEXT.common.loading}</div>;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Дашборд</h1>
        <p className="mt-1 text-sm text-text-sec">Ключевые метрики сервиса за текущий период.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">Новые регистрации за сегодня</div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between">
                <div className="text-3xl font-semibold text-text-main">{data.registrationsToday.total}</div>
                <div className="text-xs text-text-sec">итого</div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-text-sec">
                <span>Клиенты: {data.registrationsToday.clients}</span>
                <span>Мастера/студии: {data.registrationsToday.pros}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">Записей создано за 24 часа</div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-text-main">{data.bookingsLast24h}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">Конверсия в запись</div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-semibold text-text-main">
                {data.conversion == null ? "—" : `${(data.conversion * 100).toFixed(1)}%`}
              </div>
              <div className="text-xs text-text-sec">
                {data.conversion == null ? data.conversionNote : "За последние 24 часа"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-text-main">Активных подписок</div>
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
