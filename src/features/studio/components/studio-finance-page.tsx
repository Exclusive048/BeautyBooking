"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

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

type Props = {
  studioId: string;
};

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function money(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

export function StudioFinancePage({ studioId }: Props) {
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), [today]);

  const [from, setFrom] = useState(toDateKey(monthStart));
  const [to, setTo] = useState(toDateKey(today));
  const [groupBy, setGroupBy] = useState<FinanceGroupBy>("masters");
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load finance analytics");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [from, groupBy, studioId, to]);

  const groupOptions = useMemo(() => {
    const options: Array<{ value: FinanceGroupBy; label: string }> = [{ value: "masters", label: "Masters" }];
    if (data?.hasCategories) {
      options.push({ value: "categories", label: "Categories" });
    } else {
      options.push({ value: "services", label: "Services" });
    }
    return options;
  }, [data?.hasCategories]);

  useEffect(() => {
    if (!groupOptions.some((item) => item.value === groupBy)) {
      setGroupBy(groupOptions[0].value);
    }
  }, [groupBy, groupOptions]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs text-neutral-500">From</div>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs text-neutral-500">To</div>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs text-neutral-500">Group by</div>
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as FinanceGroupBy)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {groupOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border p-5 text-sm">Loading finance analytics...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading && !error && data ? (
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-50">
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">
                  {groupBy === "masters" ? "Master" : groupBy === "categories" ? "Category" : "Service"}
                </th>
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">Visits</th>
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">Sum</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.key}>
                  <td className="border-b p-3 text-sm">{row.label}</td>
                  <td className="border-b p-3 text-sm">{row.visitsCount}</td>
                  <td className="border-b p-3 text-sm font-medium">{money(row.sumAmount)}</td>
                </tr>
              ))}
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="border-b p-4 text-sm text-neutral-500">
                    No records in selected period.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-50">
                <td className="p-3 text-sm font-semibold">Total</td>
                <td className="p-3 text-sm font-semibold">{data.totalVisits}</td>
                <td className="p-3 text-sm font-semibold">{money(data.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}
