"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { providerPublicUrl, withQuery } from "@/lib/public-urls";
import { FocalImage } from "@/components/ui/focal-image";

type HotSlotItem = {
  id: string;
  provider: {
    id: string;
    publicUsername: string;
    name: string;
    avatarUrl: string | null;
    avatarFocalX: number | null;
    avatarFocalY: number | null;
    address: string;
    district: string;
    ratingAvg: number;
    ratingCount: number;
    timezone: string;
  };
  slot: {
    startAtUtc: string;
    endAtUtc: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
  };
  service: {
    id: string;
    title: string;
    price: number;
    durationMin: number;
  } | null;
};

function getDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatSlotTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const todayKey = getDateKey(now, timeZone);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = getDateKey(tomorrow, timeZone);
  const slotKey = getDateKey(date, timeZone);

  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (slotKey === todayKey) return `сегодня ${time}`;
  if (slotKey === tomorrowKey) return `завтра ${time}`;

  const dayLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "long",
  }).format(date);
  return `${dayLabel} ${time}`;
}

function formatDiscountText(type: "PERCENT" | "FIXED", value: number): string {
  return type === "FIXED" ? `Скидка -${value} ₽` : `Скидка -${value}%`;
}

function calculateDiscountedPrice(type: "PERCENT" | "FIXED", value: number, price: number): number {
  if (type === "FIXED") return Math.max(0, price - value);
  return Math.max(0, Math.round(price * (1 - value / 100)));
}

export function HotSlotsPageClient() {
  const [items, setItems] = useState<HotSlotItem[]>([]);
  const viewerTimeZone = useViewerTimeZoneContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hot-slots", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ items: HotSlotItem[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить горячие слоты.");
      }
      setItems(json.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить горячие слоты.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const emptyState = useMemo(() => !loading && !error && items.length === 0, [error, items.length, loading]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-main">Скидки на завтра</h1>
        <p className="text-sm text-text-sec">
          Выбирайте ближайшие свободные слоты с автоматической скидкой.
        </p>
      </div>

      {loading ? <div className="text-sm text-text-sec">Загрузка горячих слотов...</div> : null}

      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-300">
          <div>{error}</div>
          <Button variant="secondary" size="sm" onClick={() => void load()} className="mt-3 rounded-full">
            Повторить
          </Button>
        </div>
      ) : null}

      {emptyState ? (
        <div className="rounded-2xl border border-border bg-bg-card/80 p-8 text-center">
          <div className="text-base font-semibold text-text-main">Пока нет горячих слотов</div>
          <div className="mt-2 text-sm text-text-sec">Попробуйте позже или загляните в каталог.</div>
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const slotLabel = formatSlotTime(item.slot.startAtUtc, viewerTimeZone);
            const hasService = Boolean(item.service);
            const discountText = formatDiscountText(item.slot.discountType, item.slot.discountValue);
            const originalPrice = item.service?.price ?? null;
            const discountedPrice =
              originalPrice !== null
                ? calculateDiscountedPrice(item.slot.discountType, item.slot.discountValue, originalPrice)
                : null;
            const base = providerPublicUrl(
              { id: item.provider.id, publicUsername: item.provider.publicUsername },
              "hot-slots-card"
            );
            const href = base
              ? hasService ? withQuery(base, { serviceId: item.service!.id }) : base
              : "#";

            return (
              <Card key={item.id} className="h-full border border-border-subtle bg-bg-card/90">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full border border-border-subtle bg-bg-input/60">
                      {item.provider.avatarUrl ? (
                        <FocalImage
                          src={item.provider.avatarUrl}
                          alt={item.provider.name}
                          focalX={item.provider.avatarFocalX}
                          focalY={item.provider.avatarFocalY}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-text-sec">
                          Нет фото
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-text-main">
                        {item.provider.name}
                      </div>
                      <div className="mt-1 text-xs text-text-sec">
                        {item.provider.district || item.provider.address || "Адрес уточняется"}
                      </div>
                      <div className="mt-1 text-xs text-text-sec">
                        {item.provider.ratingAvg.toFixed(1)} • {item.provider.ratingCount} отзывов
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-200/60 px-2 py-1 text-[10px] font-semibold text-amber-900">
                      Горячее
                    </span>
                  </div>

                  <div className="rounded-xl border border-border-subtle bg-bg-input/70 p-3">
                    <div className="text-sm font-semibold text-text-main">{slotLabel}</div>
                    {hasService ? (
                      <div className="mt-1 text-xs text-text-sec">{item.service?.title}</div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {originalPrice !== null && discountedPrice !== null ? (
                        <>
                          <span className="text-text-sec line-through">{UI_FMT.priceLabel(originalPrice)}</span>
                          <span className="font-semibold text-text-main">{UI_FMT.priceLabel(discountedPrice)}</span>
                        </>
                      ) : (
                        <span className="text-text-main">{discountText}</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto">
                    <Button asChild className="w-full">
                      <Link href={href}>{hasService ? "Записаться" : "К мастеру"}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
