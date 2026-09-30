"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Clock } from "lucide-react";
import { m } from "framer-motion";
import { fetchJson } from "@/lib/http/client";
import { DISTANCE, MOTION, STAGGER, VIEWPORT_ONCE } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";
import { buildCatalogUrl } from "@/features/catalog/lib/catalog-url";

type HotSlotItem = {
  id: string;
  provider: {
    id: string;
    publicUsername: string | null;
    name: string;
    avatarUrl: string | null;
    ratingAvg: number;
    ratingCount: number;
    address: string | null;
    timezone: string;
  };
  slot: {
    startAtUtc: string;
    endAtUtc: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    isActive: true;
  };
  service: {
    id: string;
    title: string;
    price: number;
    durationMin: number;
  } | null;
};

function formatSlotTime(startUtc: string, timezone: string): string {
  try {
    const d = new Date(startUtc);
    return d.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
  } catch {
    return "";
  }
}

function formatSlotDate(startUtc: string, timezone: string): string {
  try {
    const d = new Date(startUtc);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      timeZone: timezone,
    });
  } catch {
    return "";
  }
}

function formatPrice(kopeks: number): string {
  return `${Math.round(kopeks / 100).toLocaleString("ru-RU")} ₽`;
}

function calcDiscountedPrice(kopeks: number, type: "PERCENT" | "FIXED", value: number): number {
  if (type === "PERCENT") return Math.round(kopeks * (1 - value / 100));
  return Math.max(0, kopeks - value * 100);
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: DISTANCE.rise },
  visible: {
    opacity: 1,
    y: 0,
    transition: MOTION.section,
  },
};

export function HotSlotsPreview() {
  const [slots, setSlots] = useState<HotSlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const container = containerVariants;
  const itemAnim = itemVariants;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<{ items: HotSlotItem[] }>("/api/hot-slots?limit=4", { cache: "no-store" });
        if (!cancelled) setSlots(data.items ?? []);
      } catch {
        // Витрина главной: без горящих окошек блок просто не показывается.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loading && slots.length === 0) return null;
  if (loading) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-hot" />
          <div>
            <h2 className="text-2xl font-bold text-text-main sm:text-3xl">
              {UI_TEXT.home.hotSlotsPreview.title}
            </h2>
            <p className="mt-0.5 text-sm text-text-sec sm:text-base">
              {UI_TEXT.home.hotSlotsPreview.subtitle}
            </p>
          </div>
        </div>
        <Link href={buildCatalogUrl({ hot: true })} className="shrink-0 text-sm font-medium text-accent-text hover:underline">
          {UI_TEXT.home.hotSlotsPreview.showAll}
        </Link>
      </div>

      <m.div
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT_ONCE}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {slots.map((item) => {
          const originalPrice = item.service?.price ?? 0;
          const discountedPrice = originalPrice
            ? calcDiscountedPrice(originalPrice, item.slot.discountType, item.slot.discountValue)
            : null;
          const discountLabel =
            item.slot.discountType === "PERCENT"
              ? UI_TEXT.home.hotSlotsPreview.discountPercent(item.slot.discountValue)
              : UI_TEXT.home.hotSlotsPreview.discountFixed(item.slot.discountValue);
          const profileHref = item.provider.publicUsername
            ? `/u/${item.provider.publicUsername}`
            : `/providers/${item.provider.id}`;

          return (
            <m.div
              key={item.id}
              variants={itemAnim}
              className="flex flex-col gap-3 rounded-[20px] border border-border-subtle/60 bg-bg-card/90 p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <Link href={profileHref} className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-main hover:text-accent-text">
                    {item.provider.name}
                  </p>
                  {item.provider.address ? (
                    <p className="truncate text-xs text-text-sec">{item.provider.address}</p>
                  ) : null}
                </Link>
                <span className="shrink-0 rounded-full bg-hot/10 px-2.5 py-1 text-xs font-bold text-hot-text">
                  {discountLabel}
                </span>
              </div>

              {/* Service */}
              {item.service ? (
                <div className="rounded-xl bg-bg-page/60 px-3 py-2">
                  <p className="truncate text-sm font-medium text-text-main">{item.service.title}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {discountedPrice !== null && originalPrice ? (
                      <>
                        <span className="text-sm font-bold tabular-nums text-text-main">
                          {formatPrice(discountedPrice)}
                        </span>
                        <span className="text-xs tabular-nums text-text-sec line-through">
                          {formatPrice(originalPrice)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Time */}
              <div className="flex items-center gap-1.5 text-xs text-text-sec">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {formatSlotDate(item.slot.startAtUtc, item.provider.timezone)},{" "}
                  {formatSlotTime(item.slot.startAtUtc, item.provider.timezone)}
                </span>
              </div>

              <Button asChild size="sm" className="mt-auto w-full">
                <Link href={`${profileHref}/booking?slotId=${item.id}`}>
                  {UI_TEXT.home.hotSlotsPreview.book}
                </Link>
              </Button>
            </m.div>
          );
        })}
      </m.div>
    </section>
  );
}
