"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type FinanceGroupBy = "masters" | "categories" | "services";

type FinanceRow = {
  key: string;
  label: string;
  visitsCount: number;
  sumAmount: number;
};

type FinanceData = {
  groupBy: FinanceGroupBy;
  rows: FinanceRow[];
  totalVisits: number;
  totalAmount: number;
  hasCategories: boolean;
};

type FinanceSummaryData = {
  todayAmount: number;
  last7DaysAmount: number;
  last30DaysAmount: number;
  recentBookings: Array<{
    id: string;
    startAtUtc: string | null;
    clientName: string;
    masterName: string | null;
    amount: number;
  }>;
};

type Props = {
  studioId: string;
};

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function money(value: number, suffix: string): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ${suffix}`;
}


export function StudioFinancePage({ studioId }: Props) {
  const t = UI_TEXT.studioCabinet.finance;
  const viewerTimeZone = useViewerTimeZoneContext();
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), [today]);

  const [from, setFrom] = useState(toDateKey(monthStart));
  const [to, setTo] = useState(toDateKey(today));
  const [groupBy, setGroupBy] = useState<FinanceGroupBy>("masters");
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const params = new URLSearchParams({ studioId });
        const res = await fetch(`/api/studio/finance/summary?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<FinanceSummaryData> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
        }
        setSummary(json.data);
      } catch (err) {
        setSummaryError(err instanceof Error ? err.message : t.summaryLoadFailed);
      } finally {
        setSummaryLoading(false);
      }
    };

    void loadSummary();
  }, [studioId, t.apiErrorPrefix, t.summaryLoadFailed]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          studioId,
          from,
          to,
          groupBy,
        });
        const res = await fetch(`/api/studio/finance?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<FinanceData> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
        }
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.loadFailed);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [from, groupBy, studioId, t.apiErrorPrefix, t.loadFailed, to]);

  const groupOptions = useMemo(() => {
    const options: Array<{ value: FinanceGroupBy; label: string }> = [
      { value: "masters", label: t.groupMasters },
    ];
    if (data?.hasCategories) {
      options.push({ value: "categories", label: t.groupCategories });
    } else {
      options.push({ value: "services", label: t.groupServices });
    }
    return options;
  }, [data?.hasCategories, t.groupCategories, t.groupMasters, t.groupServices]);

  const tabItems = useMemo<TabItem[]>(() => {
    return groupOptions.map((item) => ({ id: item.value, label: item.label }));
  }, [groupOptions]);

  useEffect(() => {
    if (!groupOptions.some((item) => item.value === groupBy)) {
      setGroupBy(groupOptions[0].value);
    }
  }, [groupBy, groupOptions]);

  return (
    <section className="space-y-4">
      {summaryError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{summaryError}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="lux-card rounded-[24px] p-4">
          <div className="text-xs text-text-sec">{t.summary.today}</div>
          <div className="mt-2 text-2xl font-semibold text-text-main">
            {summaryLoading || !summary ? "—" : money(summary.todayAmount, t.moneySuffix)}
          </div>
        </div>
        <div className="lux-card rounded-[24px] p-4">
          <div className="text-xs text-text-sec">{t.summary.last7Days}</div>
          <div className="mt-2 text-2xl font-semibold text-text-main">
            {summaryLoading || !summary ? "—" : money(summary.last7DaysAmount, t.moneySuffix)}
          </div>
        </div>
        <div className="lux-card rounded-[24px] p-4">
          <div className="text-xs text-text-sec">{t.summary.last30Days}</div>
          <div className="mt-2 text-2xl font-semibold text-text-main">
            {summaryLoading || !summary ? "—" : money(summary.last30DaysAmount, t.moneySuffix)}
          </div>
        </div>
      </div>

      {summaryLoading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.summaryLoading}</div>
      ) : summary ? (
        summary.recentBookings.length > 0 ? (
          <div className="lux-card overflow-hidden rounded-[24px]">
            <div className="px-4 py-3 text-sm font-semibold text-text-main">{t.recentTitle}</div>
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">{t.recentColumns.client}</th>
                  <th className="px-4 py-3 text-left">{t.recentColumns.master}</th>
                  <th className="px-4 py-3 text-left">{t.recentColumns.date}</th>
                  <th className="px-4 py-3 text-left">{t.recentColumns.amount}</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentBookings.map((booking, index) => (
                  <tr key={booking.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                    <td className="px-4 py-3 text-sm text-text-main">{booking.clientName}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{booking.masterName ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">
                      {UI_FMT.dateTimeShort(booking.startAtUtc ?? "", { timeZone: viewerTimeZone })}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-main">
                      {money(booking.amount, t.moneySuffix)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.recentEmpty}</div>
        )
      ) : null}

      <div className="lux-card rounded-[24px] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">
            <div className="mb-1 text-xs text-text-sec">{t.from}</div>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs text-text-sec">{t.to}</div>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <div className="text-sm">
            <div className="mb-1 text-xs text-text-sec">{t.groupBy}</div>
            <Tabs
              items={tabItems}
              value={groupBy}
              onChange={(id) => setGroupBy(id as FinanceGroupBy)}
              className="w-fit"
            />
          </div>
        </div>
      </div>

      {loading ? <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading && !error && data ? (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                <th className="px-4 py-3 text-left">{t.columnEntity}</th>
                <th className="px-4 py-3 text-left">{t.columnVisits}</th>
                <th className="px-4 py-3 text-left">{t.columnSum}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={row.key} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                  <td className="px-4 py-3 text-sm text-text-main">{row.label}</td>
                  <td className="px-4 py-3 text-sm text-text-main">{row.visitsCount}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-main">
                    {money(row.sumAmount, t.moneySuffix)}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-sm text-text-sec">
                    {t.noRecords}
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="bg-bg-input/55">
                <td className="px-4 py-3 text-sm font-semibold text-text-main">{t.total}</td>
                <td className="px-4 py-3 text-sm font-semibold text-text-main">{data.totalVisits}</td>
                <td className="px-4 py-3 text-sm font-semibold text-text-main">
                  {money(data.totalAmount, t.moneySuffix)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}
