"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl } from "@/lib/public-urls";
import type { RecentMasterItem } from "@/lib/bookings/recent-masters";
import type { ApiResponse } from "@/lib/types/api";

function formatPrice(price: number): string {
  return `${price} ${UI_TEXT.common.currencyRub}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function AvatarCircle({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={48}
        height={48}
        className="h-12 w-12 rounded-full object-cover"
      />
    );
  }
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {initials}
    </div>
  );
}

function RecentMasterCard({ item }: { item: RecentMasterItem }) {
  const profileUrl = providerPublicUrl(
    { id: item.provider.id, publicUsername: item.provider.publicUsername },
    "rebook"
  );
  const bookingUrl = item.provider.publicUsername
    ? `/u/${item.provider.publicUsername}/booking?serviceId=${item.lastService.id}`
    : `/providers/${item.provider.id}`;

  return (
    <article className="flex w-64 shrink-0 flex-col rounded-2xl border border-border-subtle bg-bg-card p-4 shadow-card">
      <Link href={profileUrl} className="flex items-center gap-3">
        <AvatarCircle name={item.provider.name} url={item.provider.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text-main">
            {item.provider.name}
          </div>
          {item.provider.category ? (
            <div className="truncate text-xs text-text-sec">
              {item.provider.category}
            </div>
          ) : null}
        </div>
      </Link>

      <div className="mt-3 space-y-1.5">
        <div className="truncate text-xs text-text-sec">
          {item.lastService.name} · {formatPrice(item.lastService.price)}
        </div>
        <div className="flex items-center gap-1 text-xs text-text-sec">
          <Calendar className="h-3 w-3" />
          <span>
            {UI_TEXT.home.rebook.lastVisit}: {formatDate(item.lastVisit)}
          </span>
        </div>
        {item.nextSlot ? (
          <div className="flex items-center gap-1 text-xs font-medium text-primary">
            <Clock className="h-3 w-3" />
            <span>
              {UI_TEXT.home.rebook.nextSlot}: {item.nextSlot.date.split("-").reverse().join(".")},{" "}
              {item.nextSlot.time}
            </span>
          </div>
        ) : (
          <div className="text-xs text-text-sec">
            {UI_TEXT.home.rebook.noSlots}
          </div>
        )}
      </div>

      <div className="mt-auto pt-3">
        <Button asChild size="sm" className="w-full">
          <Link href={bookingUrl}>{UI_TEXT.home.rebook.bookAgain}</Link>
        </Button>
      </div>
    </article>
  );
}

export function RecentMastersSection() {
  const [items, setItems] = useState<RecentMasterItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchMasters = useCallback(async () => {
    try {
      const res = await fetch("/api/bookings/recent-masters", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        items: RecentMasterItem[];
      }> | null;
      if (!json || !json.ok) return;
      setItems(json.data.items);
    } catch {
      /* silent — graceful degradation */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void fetchMasters();
  }, [fetchMasters]);

  if (!loaded || items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-text-main">
        {UI_TEXT.home.rebook.title}
      </h2>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {items.map((item) => (
            <RecentMasterCard key={item.provider.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
