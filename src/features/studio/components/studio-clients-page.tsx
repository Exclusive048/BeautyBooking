"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type ClientItem = {
  key: string;
  displayName: string;
  phone: string;
  lastBookingAt: string;
  lastServiceName: string;
  visitsCount: number;
  totalAmount: number;
};

type ClientsData = {
  clients: ClientItem[];
};

type Props = {
  studioId: string;
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number, suffix: string): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ${suffix}`;
}

export function StudioClientsPage({ studioId }: Props) {
  const t = UI_TEXT.studioCabinet.clients;
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort") === "newest" ? "newest" : undefined;
  const [data, setData] = useState<ClientsData>({ clients: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ studioId });
        if (sort) {
          params.set("sort", sort);
        }
        const res = await fetch(`/api/studio/clients?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<ClientsData> | null;
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
  }, [sort, studioId, t.apiErrorPrefix, t.loadFailed]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {data.clients.length === 0 ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.empty}</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                <th className="px-4 py-3 text-left">{t.columns.client}</th>
                <th className="px-4 py-3 text-left">{t.columns.phone}</th>
                <th className="px-4 py-3 text-left">{t.columns.lastBooking}</th>
                <th className="px-4 py-3 text-left">{t.columns.service}</th>
                <th className="px-4 py-3 text-left">{t.columns.visits}</th>
                <th className="px-4 py-3 text-left">{t.columns.amount}</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client, index) => (
                <tr key={client.key} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                  <td className="px-4 py-3 text-sm text-text-main">{client.displayName}</td>
                  <td className="px-4 py-3 text-sm text-text-sec">{client.phone}</td>
                  <td className="px-4 py-3 text-sm text-text-sec">{formatDateTime(client.lastBookingAt)}</td>
                  <td className="px-4 py-3 text-sm text-text-sec">{client.lastServiceName}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-main">{client.visitsCount}</td>
                  <td className="px-4 py-3 text-sm text-text-main">{formatMoney(client.totalAmount, t.moneySuffix)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
