/* eslint-disable @next/next/no-img-element -- full-screen modal with dynamic aspect ratio */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Button } from "@/components/ui/button";
import type { PortfolioDetail } from "@/lib/feed/portfolio.service";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl, withQuery } from "@/lib/public-urls";

type Props = {
  itemId: string | null;
  open: boolean;
  onClose: () => void;
};

export function PortfolioPreviewModal({ itemId, open, onClose }: Props) {
  const [detail, setDetail] = useState<PortfolioDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemId) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`/api/home/portfolio/${itemId}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ item: PortfolioDetail }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : UI_TEXT.home.detailsFailed);
        }
        if (!cancelled) {
          setDetail(json.data.item);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : UI_TEXT.home.detailsFailed);
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemId, open]);

  const primaryService = detail?.serviceOptions[0] ?? null;
  const actionHref = detail
    ? (() => {
        const base = providerPublicUrl(
          { id: detail.masterId, publicUsername: detail.masterPublicUsername },
          "portfolio-preview"
        );
        return primaryService ? withQuery(base, { serviceId: primaryService.serviceId }) : base;
      })()
    : null;

  return (
    <ModalSurface open={open} onClose={onClose} className="max-w-4xl p-0">
      {loading ? (
        <div className="p-6 text-sm text-text-sec">{UI_TEXT.home.loading}</div>
      ) : error ? (
        <div className="p-6 text-sm text-rose-500">{error}</div>
      ) : detail ? (
        <div className="grid gap-6 p-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-2xl bg-bg-input">
            <img
              src={detail.mediaUrl}
              alt={detail.caption ?? detail.primaryServiceTitle ?? detail.masterName}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase text-text-sec">{UI_TEXT.home.preview.masterLabel}</div>
              <div className="text-lg font-semibold text-text-main">{detail.masterName}</div>
              {detail.studioName ? (
                <div className="text-sm text-text-sec">{detail.studioName}</div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-4 text-sm text-text-main">
              <div className="text-xs uppercase text-text-sec">{UI_TEXT.home.preview.onPhotoLabel}</div>
              <div className="mt-1 font-medium">
                {detail.primaryServiceTitle ?? detail.caption ?? detail.masterName}
              </div>
            </div>

            {actionHref ? (
              <Button asChild className="w-full">
                <Link href={actionHref}>
                  {primaryService ? UI_TEXT.home.bookService : UI_TEXT.home.goToMaster}
                </Link>
              </Button>
            ) : (
              <Button type="button" variant="secondary" className="w-full" disabled>
                {primaryService ? UI_TEXT.home.bookService : UI_TEXT.home.goToMaster}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </ModalSurface>
  );
}
