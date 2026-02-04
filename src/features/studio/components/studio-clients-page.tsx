"use client";

import { useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type ClientItem = {
  key: string;
  displayName: string;
  phone: string;
  lastBookingAt: string;
  lastServiceName: string;
  visitsCount: number;
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

export function StudioClientsPage({ studioId }: Props) {
  const [data, setData] = useState<ClientsData>({ clients: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ studioId });
        const res = await fetch(`/api/studio/clients?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<ClientsData> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load clients");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [studioId]);

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm">Loading clients...</div>;
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {data.clients.length === 0 ? (
        <div className="rounded-2xl border p-5 text-sm text-neutral-600">No clients yet. Clients are built from bookings.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-50">
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">Client</th>
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">Phone</th>
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">Last booking</th>
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">Service</th>
                <th className="border-b p-3 text-left text-xs font-semibold text-neutral-600">Visits</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client) => (
                <tr key={client.key}>
                  <td className="border-b p-3 text-sm">{client.displayName}</td>
                  <td className="border-b p-3 text-sm text-neutral-600">{client.phone}</td>
                  <td className="border-b p-3 text-sm text-neutral-600">{formatDateTime(client.lastBookingAt)}</td>
                  <td className="border-b p-3 text-sm text-neutral-600">{client.lastServiceName}</td>
                  <td className="border-b p-3 text-sm font-medium">{client.visitsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
