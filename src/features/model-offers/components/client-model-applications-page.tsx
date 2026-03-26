"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FocalImage } from "@/components/ui/focal-image";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";

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
    };
    service: {
      id: string;
      title: string;
      categoryTitle: string | null;
      durationMin: number;
    };
  };
};

function extractApiError<T>(json: ApiResponse<T> | null, fallback: string): string {
  if (json && !json.ok) return json.error.message || fallback;
  return fallback;
}

function normalizeStatus(status: RawStatus): NormalizedStatus {
  if (status === "APPROVED_WAITING_CLIENT" || status === "TIME_PROPOSED") return "TIME_PROPOSED";
  if (status === "CONFIRMED") return "CONFIRMED";
  if (status === "REJECTED") return "REJECTED";
  return "PENDING";
}

function statusMeta(status: RawStatus, proposedTimeLocal: string | null, confirmedStartAt: string | null): {
  badge: string;
  badgeClass: string;
  description: string;
} {
  const normalized = normalizeStatus(status);
  if (normalized === "PENDING") {
    return {
      badge: "Ожидает",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      description: "Ожидает ответа мастера",
    };
  }
  if (normalized === "REJECTED") {
    return {
      badge: "Отклонена",
      badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
      description: "Мастер не принял заявку",
    };
  }
  if (normalized === "TIME_PROPOSED") {
    return {
      badge: "Предложено время",
      badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
      description: `Мастер предлагает время ${proposedTimeLocal ?? "—"}`,
    };
  }
  return {
    badge: "Подтверждено",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    description: confirmedStartAt ? `Подтверждено! ${UI_FMT.dateTimeLong(confirmedStartAt)}` : "Подтверждено!",
  };
}

export function ClientModelApplicationsPage() {
  const searchParams = useSearchParams();
  const highlightedId = searchParams.get("applicationId");

  const [items, setItems] = useState<ModelApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/me/model-applications", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ applications: ModelApplicationItem[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(extractApiError(json, "Не удалось загрузить заявки"));
      }
      setItems(Array.isArray(json.data.applications) ? json.data.applications : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = useCallback(
    async (applicationId: string) => {
      setConfirmingId(applicationId);
      setActionError(null);
      try {
        const res = await fetchWithAuth(`/api/model-applications/${applicationId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ bookingId: string | null }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(extractApiError(json, "Не удалось подтвердить время"));
        }
        await load();
      } catch (confirmError) {
        setActionError(confirmError instanceof Error ? confirmError.message : "Не удалось подтвердить время");
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
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-600 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
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
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{actionError}</div>
      ) : null}

      {sortedItems.map((item) => {
        const meta = statusMeta(item.status, item.proposedTimeLocal, item.confirmedStartAt);
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
              <Badge className={meta.badgeClass}>{meta.badge}</Badge>
            </div>

            <div className="mt-3 flex items-center gap-3">
              {item.offer.master.avatarUrl ? (
                <FocalImage
                  src={item.offer.master.avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
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
              <div className="mt-3 rounded-xl border border-blue-200/70 bg-blue-50/70 px-3 py-2 text-xs text-blue-700">
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
                  onClick={() => setActionError("Отклонение времени пока недоступно. Можно дождаться нового предложения мастера.")}
                  disabled={isConfirming}
                >
                  Отклонить
                </Button>
              </div>
            ) : null}

            {item.offer.master.publicUsername ? (
              <div className="mt-3">
                <Link href={`/u/${item.offer.master.publicUsername}`} className="text-xs text-primary underline">
                  Профиль мастера
                </Link>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
