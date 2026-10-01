"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel } from "@/lib/ui/zone-label";

type RawStatus = "PENDING" | "REJECTED" | "APPROVED_WAITING_CLIENT" | "CONFIRMED" | "TIME_PROPOSED";
type NormalizedStatus = "PENDING" | "REJECTED" | "TIME_PROPOSED" | "CONFIRMED";

type ModelApplicationItem = {
  id: string;
  status: RawStatus;
  clientNote: string | null;
  proposedTimeLocal: string | null;
  confirmedStartAt: string | null;
  bookingId: string | null;
  createdAt: string;
  offer: {
    id: string;
    status: string;
    dateLocal: string;
    timeRangeStartLocal: string;
    timeRangeEndLocal: string;
    price: number | null;
    requirements: string[];
    extraBusyMin: number;
    master: {
      id: string;
      name: string;
      avatarUrl: string | null;
      publicUsername: string | null;
      timezone: string;
    };
    service: {
      id: string;
      title: string;
      categoryTitle: string | null;
      durationMin: number;
    };
  };
};

const E = UI_TEXT.clientCabinet.modelApplications;

function normalizeStatus(status: RawStatus): NormalizedStatus {
  if (status === "APPROVED_WAITING_CLIENT" || status === "TIME_PROPOSED") return "TIME_PROPOSED";
  if (status === "CONFIRMED") return "CONFIRMED";
  if (status === "REJECTED") return "REJECTED";
  return "PENDING";
}

function statusMeta(
  status: RawStatus,
  proposedTimeLocal: string | null,
  confirmedStartAt: string | null,
  offerStatus: string,
  salonTimeZone: string,
): {
  badge: string;
  badgeVariant: "warning" | "muted" | "info" | "success";
  description: string;
} {
  const normalized = normalizeStatus(status);
  if (normalized === "PENDING") {
    return {
      badge: "Ожидает",
      badgeVariant: "warning",
      description: "Ожидает ответа мастера",
    };
  }
  if (normalized === "REJECTED") {
    // MASTER-MODELS-FIX-A: soften wording when the rejection came from
    // the confirm-cascade (the offer is CLOSED because another model
    // confirmed). Direct rejection by the master keeps the original
    // copy. Derivation is data-only — no schema change required.
    const isCascadeReject = offerStatus === "CLOSED";
    return {
      badge: isCascadeReject ? "Не выбран" : "Отклонена",
      badgeVariant: "muted",
      description: isCascadeReject
        ? "Мастер выбрал другого участника"
        : "Мастер не принял заявку",
    };
  }
  if (normalized === "TIME_PROPOSED") {
    return {
      badge: "Предложено время",
      badgeVariant: "info",
      description: `Мастер предлагает время ${proposedTimeLocal ?? "—"}`,
    };
  }
  return {
    badge: "Подтверждено",
    badgeVariant: "success",
    // salon-tz с меткой зоны (rule 17): это время записи, а не момент события.
    description: confirmedStartAt
      ? `Время подтверждено · ${UI_FMT.dateTimeLong(confirmedStartAt, { timeZone: salonTimeZone })} ${formatZoneLabel({ iso: confirmedStartAt, timeZone: salonTimeZone })}`.trimEnd()
      : "Время подтверждено",
  };
}

export function ClientModelApplicationsPage() {
  const searchParams = useSearchParams();
  const highlightedId = searchParams.get("applicationId");

  const [items, setItems] = useState<ModelApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJsonWithAuth<{ applications: ModelApplicationItem[]; nextCursor: string | null }>(
        "/api/me/model-applications",
        { cache: "no-store" },
      );
      setItems(Array.isArray(data.applications) ? data.applications : []);
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      setError(serverMessageOr(loadError, E.loadFailed));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const url = `/api/me/model-applications?cursor=${encodeURIComponent(nextCursor)}`;
      const data = await fetchJsonWithAuth<{ applications: ModelApplicationItem[]; nextCursor: string | null }>(
        url,
        { cache: "no-store" },
      );
      setItems((prev) => [...prev, ...(Array.isArray(data.applications) ? data.applications : [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (moreError) {
      setActionError(serverMessageOr(moreError, E.loadFailed));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = useCallback(
    async (applicationId: string) => {
      setConfirmingId(applicationId);
      setActionError(null);
      try {
        await fetchJsonWithAuth<{ bookingId: string | null }>(`/api/model-applications/${applicationId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        await load();
      } catch (confirmError) {
        // «Время этого предложения уже прошло…» (29.09 · 07) и прочие — дословно.
        setActionError(serverMessageOr(confirmError, E.confirmFailed));
      } finally {
        setConfirmingId(null);
      }
    },
    [load]
  );

  const hasItems = items.length > 0;
  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.status === "CONFIRMED" && b.status !== "CONFIRMED") return 1;
        if (b.status === "CONFIRMED" && a.status !== "CONFIRMED") return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [items]
  );

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загружаем заявки...</div>;
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-danger-border bg-danger-surface p-5 text-sm text-danger-text">
        {error}
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">
        Пока нет заявок на модель.{" "}
        <Link href="/models" className="underline">
          Перейти к предложениям
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError ? (
        <div role="alert" className="rounded-2xl border border-danger-border bg-danger-surface p-4 text-sm text-danger-text">{actionError}</div>
      ) : null}

      {sortedItems.map((item) => {
        const meta = statusMeta(
          item.status,
          item.proposedTimeLocal,
          item.confirmedStartAt,
          item.offer.status,
          item.offer.master.timezone,
        );
        const normalizedStatus = normalizeStatus(item.status);
        const isHighlighted = highlightedId === item.id;
        const isConfirming = confirmingId === item.id;

        return (
          <article
            key={item.id}
            className={[
              "lux-card rounded-[22px] p-4 transition-all",
              isHighlighted ? "ring-2 ring-primary/35" : "",
            ]
              .join(" ")
              .trim()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-text-sec">
                  {item.offer.dateLocal} • {item.offer.timeRangeStartLocal}-{item.offer.timeRangeEndLocal}
                </div>
                <h3 className="mt-1 truncate text-base font-semibold text-text-main">{item.offer.service.title}</h3>
              </div>
              <Badge variant={meta.badgeVariant}>{meta.badge}</Badge>
            </div>

            <div className="mt-3 flex items-center gap-3">
              {item.offer.master.avatarUrl ? (
                <ResilientImage
                  src={item.offer.master.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-input text-xs font-semibold text-text-sec">
                  {item.offer.master.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-main">{item.offer.master.name}</div>
                <p className="text-xs text-text-sec">{meta.description}</p>
              </div>
            </div>

            {normalizedStatus === "TIME_PROPOSED" ? (
              <div className="mt-3 rounded-xl border border-info-border bg-info-surface px-3 py-2 text-xs text-info-text">
                Предложенное время: {item.proposedTimeLocal ?? "—"}
              </div>
            ) : null}

            {normalizedStatus === "TIME_PROPOSED" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleConfirm(item.id)}
                  disabled={isConfirming}
                >
                  {isConfirming ? "Подтверждаем..." : "Подтвердить время"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActionError("Пока нельзя отклонить время. Дождитесь нового предложения мастера.")}
                  disabled={isConfirming}
                >
                  Отклонить
                </Button>
              </div>
            ) : null}

            {item.offer.master.publicUsername ? (
              <div className="mt-3">
                <Link href={`/u/${item.offer.master.publicUsername}`} className="text-xs text-accent-text underline">
                  Профиль мастера
                </Link>
              </div>
            ) : null}
          </article>
        );
      })}

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Загружаем..." : "Показать ещё"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
