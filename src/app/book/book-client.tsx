"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { providerPublicUrl, withQuery } from "@/lib/public-urls";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

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
  if (hours > 0 && minutes > 0) {
    return `${hours}${UI_TEXT.common.hoursShortLetter} ${minutes}${UI_TEXT.common.minutesShortLetter}`;
  }
  if (hours > 0) return `${hours}${UI_TEXT.common.hoursShortLetter}`;
  return `${minutes}${UI_TEXT.common.minutesShortLetter}`;
}

export default function BookFromPortfolioClient() {
  const params = useSearchParams();
  const viewerTimeZone = useViewerTimeZoneContext();
  const portfolioId = params.get("portfolioId");
  const hasPortfolioId = Boolean(portfolioId);

  const [loading, setLoading] = useState(hasPortfolioId);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortfolioDetail | null>(null);

  useEffect(() => {
    if (!portfolioId) return;

    let cancelled = false;
    void (async () => {
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

  const primaryService = detail?.serviceOptions[0] ?? null;
  const bookLink = useMemo(() => {
    if (!detail) return "#";
    const base = providerPublicUrl(
      { id: detail.masterId, publicUsername: detail.masterPublicUsername },
      "portfolio-book"
    );
    if (!base) return "#";
    return primaryService ? withQuery(base, { serviceId: primaryService.serviceId }) : base;
  }, [detail, primaryService]);
  const canOpenProfile = Boolean(detail);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-semibold text-text-main">{UI_TEXT.feed.bookThisService}</h1>

      {loading ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-4 text-sm text-text-sec">
          {UI_TEXT.common.loading}
        </div>
      ) : null}
      {!hasPortfolioId ? (
        <div className="rounded-2xl border border-red-300/60 bg-red-950/30 p-4 text-sm text-red-200">
          {UI_TEXT.feed.detailsFailed}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-300/60 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {detail ? (
        <div className="space-y-4 rounded-2xl border border-border-subtle bg-bg-card p-5">
          <div>
            <div className="text-sm text-text-sec">{UI_TEXT.feed.byMaster}</div>
            <div className="text-lg font-semibold text-text-main">{detail.masterName}</div>
          </div>

          <div>
            <div className="text-sm font-semibold text-text-main">{UI_TEXT.feed.whatOnPhoto}</div>
            <ul className="mt-2 space-y-1 text-sm text-text-sec">
              {detail.serviceOptions.map((service) => (
                <li key={service.serviceId}>
                  • {service.title} - {formatDuration(service.durationMin)} / {UI_FMT.priceLabel(service.price)}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-sm">
            <div className="font-semibold text-text-main">{UI_TEXT.feed.total}</div>
            <div className="mt-1 text-text-sec">
              {formatDuration(detail.totalDurationMin)} / {UI_FMT.priceLabel(detail.totalPrice)}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-text-main">{UI_TEXT.feed.nearestSlots}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.nearestSlots.length === 0 ? (
                <span className="text-sm text-text-sec">{UI_TEXT.feed.noSlots}</span>
              ) : (
                detail.nearestSlots.map((slot) => (
                  <span
                    key={slot.startAt}
                    className="rounded-full border border-border-subtle bg-bg-input px-3 py-1 text-xs text-text-main"
                  >
                    {UI_FMT.dateTimeShort(slot.startAt, { timeZone: viewerTimeZone })}
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
                ? "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-[rgb(var(--accent-foreground))]"
                : "pointer-events-none cursor-default bg-bg-input text-text-sec"
            }`}
          >
            {UI_TEXT.feed.bookNow}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
