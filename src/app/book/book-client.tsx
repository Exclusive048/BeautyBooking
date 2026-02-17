"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";

type PortfolioDetail = {
  id: string;
  masterId: string;
  masterName: string;
  masterPublicUsername: string | null;
  serviceIds: string[];
  serviceOptions: Array<{
    serviceId: string;
    title: string;
    durationMin: number;
    price: number;
  }>;
  totalDurationMin: number;
  totalPrice: number;
  nearestSlots: Array<{ startAt: string }>;
};


function formatDuration(min: number): string {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours > 0 && minutes > 0) return `${hours}ч ${minutes}м`;
  if (hours > 0) return `${hours}ч`;
  return `${minutes}м`;
}

export default function BookFromPortfolioClient() {
  const params = useSearchParams();
  const portfolioId = params.get("portfolioId");
  const hasPortfolioId = Boolean(portfolioId);

  const [loading, setLoading] = useState(hasPortfolioId);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortfolioDetail | null>(null);

  useEffect(() => {
    if (!portfolioId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/portfolio/${portfolioId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ item: PortfolioDetail }> | null;
      if (!cancelled && res.ok && json && json.ok) {
        setDetail(json.data.item);
      } else if (!cancelled) {
        setError(json && !json.ok ? json.error.message : UI_TEXT.feed.detailsFailed);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const bookLink = useMemo(() => {
    if (!detail?.masterPublicUsername) return "#";
    return detail.masterPublicUsername ? `/u/${detail.masterPublicUsername}` : "#";
  }, [detail]);
  const canOpenProfile = Boolean(detail?.masterPublicUsername);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-semibold text-neutral-900">{UI_TEXT.feed.bookThisService}</h1>

      {loading ? <div className="rounded-2xl border p-4 text-sm text-neutral-600">{UI_TEXT.common.loading}</div> : null}
      {!hasPortfolioId ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {UI_TEXT.feed.detailsFailed}
        </div>
      ) : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {detail ? (
        <div className="space-y-4 rounded-2xl border bg-white p-5">
          <div>
            <div className="text-sm text-neutral-500">{UI_TEXT.feed.byMaster}</div>
            <div className="text-lg font-semibold">{detail.masterName}</div>
          </div>

          <div>
            <div className="text-sm font-semibold">{UI_TEXT.feed.whatOnPhoto}</div>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">
              {detail.serviceOptions.map((service) => (
                <li key={service.serviceId}>
                  • {service.title} — {formatDuration(service.durationMin)} / {UI_FMT.priceLabel(service.price)}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-neutral-50 p-3 text-sm">
            <div className="font-semibold">{UI_TEXT.feed.total}</div>
            <div className="mt-1">
              {formatDuration(detail.totalDurationMin)} / {UI_FMT.priceLabel(detail.totalPrice)}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold">{UI_TEXT.feed.nearestSlots}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.nearestSlots.length === 0 ? (
                <span className="text-sm text-neutral-500">{UI_TEXT.feed.noSlots}</span>
              ) : (
                detail.nearestSlots.map((slot) => (
                  <span key={slot.startAt} className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-700">
                    {new Date(slot.startAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ))
              )}
            </div>
          </div>

          <Link
            href={bookLink}
            aria-disabled={!canOpenProfile}
            className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold ${
              canOpenProfile
                ? "bg-black text-white"
                : "cursor-default bg-neutral-200 text-neutral-500 pointer-events-none"
            }`}
          >
            {UI_TEXT.feed.bookNow}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
