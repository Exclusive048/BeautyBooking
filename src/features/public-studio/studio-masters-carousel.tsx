"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IMAGE_ZOOM } from "@/components/ui/motion-classes";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { providerPublicUrl, studioBookingUrl } from "@/lib/public-urls";
import { ResilientImage } from "@/components/ui/resilient-image";

export type StudioMasterCard = {
  id: string;
  name: string;
  publicUsername: string | null;
  /** STUDIO-MASTER-PROFILES (этап 4): лицо и рейтинг приходят со списком команды. */
  avatarUrl?: string | null;
  tagline?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  portfolioProviderId?: string | null;
};

type PortfolioFeedItem = {
  mediaUrl: string;
};

type MasterExtra = {
  avatarUrl: string | null;
  specialization: string | null;
  grade: string;
  portfolioThumbs: string[];
};

type Props = {
  studio: { id: string; publicUsername: string | null };
  masters: StudioMasterCard[];
  /** FIX-STUDIO-02 (owner parity): suppress per-master booking CTAs for the owner. */
  hideBooking?: boolean;
};

function gradeLabel(rating: number, reviews: number): string {
  if (reviews >= 50 && rating >= 4.8) return UI_TEXT.publicStudio.gradeTop;
  if (reviews >= 10 && rating >= 4.5) return UI_TEXT.publicStudio.gradePro;
  return UI_TEXT.publicStudio.gradeNew;
}

export function StudioMastersCarousel({ studio, masters, hideBooking }: Props) {
  const [extras, setExtras] = useState<Record<string, MasterExtra>>({});

  useEffect(() => {
    if (masters.length === 0) return;
    let cancelled = false;

    async function load() {
      // STUDIO-MASTER-PROFILES (этап 4): лицо, описание и рейтинг профиля в
      // студии приходят со списком команды — отдельный запрос профиля отдавал
      // бы 404 (у профиля в студии нет публичной страницы). Миниатюры — работы
      // с личной страницы мастера, если она открыта.
      const entries = await Promise.all(
        masters.map(async (master) => {
          const portfolioOwner = master.portfolioProviderId ?? null;
          // Превью работ мастера: не прочитали — карточка без миниатюр.
          const portfolio = portfolioOwner
            ? await fetchJson<{ items: PortfolioFeedItem[] }>(
                `/api/feed/portfolio?masterId=${encodeURIComponent(portfolioOwner)}&limit=3`,
                { cache: "no-store" },
              )
                .then((data) => data.items)
                .catch(() => [] as PortfolioFeedItem[])
            : [];

          const value: MasterExtra = {
            avatarUrl: master.avatarUrl ?? null,
            specialization: master.tagline?.trim() || null,
            grade: gradeLabel(master.ratingAvg ?? 0, master.ratingCount ?? 0),
            portfolioThumbs: portfolio.slice(0, 3).map((item) => item.mediaUrl),
          };

          return [master.id, value] as const;
        })
      );

      if (cancelled) return;
      setExtras(Object.fromEntries(entries));
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [masters]);

  const hasMasters = masters.length > 0;
  const masterCards = useMemo(
    () =>
      masters.map((master) => {
        const extra = extras[master.id];
        return {
          ...master,
          avatarUrl: extra?.avatarUrl ?? null,
          specialization: extra?.specialization ?? null,
          grade: extra?.grade ?? UI_TEXT.publicStudio.gradeNew,
          thumbs: extra?.portfolioThumbs ?? [],
        };
      }),
    [extras, masters]
  );

  if (!hasMasters) {
    return <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 text-sm text-text-sec">{UI_TEXT.publicStudio.noMasters}</div>;
  }

  // Команда — сеткой рядами и колонками, без горизонтальной прокрутки
  // (решение владельца 2026-09-24).
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {masterCards.map((master) => {
        const masterHref = providerPublicUrl(
          { id: master.id, publicUsername: master.publicUsername },
          "studio-masters-carousel"
        ) ?? "#";
        const bookingHref = studioBookingUrl(
          studio,
          master.publicUsername ? { master: master.publicUsername } : undefined,
          "studio-masters-carousel"
        ) ?? "#";

        return (
          <article key={master.id} className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
            <div className="relative h-44 shrink-0 overflow-hidden bg-muted sm:h-48">
              {master.avatarUrl ? (
                <ResilientImage
                  src={master.avatarUrl}
                  alt={master.name}
                  sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
                  className={`object-cover ${IMAGE_ZOOM}`}
                />
              ) : (
                <div className="h-full w-full bg-bg-input" />
              )}
              <div className="absolute left-3 top-3 rounded-full border border-border-subtle bg-bg-card/80 px-2 py-1 text-xs font-medium text-text-main backdrop-blur">
                {master.grade}
              </div>

              <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/65 p-3 transition duration-200 group-hover:translate-y-0">
                {master.thumbs.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1">
                    {master.thumbs.map((thumb, index) => (
                      <div key={`${master.id}-${index}`} className="relative h-12 w-full overflow-hidden rounded-md">
                        {/* RES-29: миниатюра портфолио — такой же пользовательский
                            URL, как аватар 17 строками выше, и обязана деградировать
                            так же. Сырой `next/image` на хосте вне `remotePatterns`
                            БРОСАЕТ в рендере, а на мёртвой ссылке рисует сломанную
                            картинку — без `onError` и без гейта `isOptimizableImageSrc`. */}
                        <ResilientImage
                          src={thumb}
                          alt={UI_TEXT.publicStudio.masterWorkAltTemplate
                            .replace("{name}", master.name)
                            .replace("{n}", String(index + 1))}
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-white/80">{UI_TEXT.publicStudio.noPortfolio}</div>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
              <div className="truncate text-sm font-semibold text-text">{master.name}</div>
              {master.specialization ? <div className="line-clamp-2 text-xs text-text-muted">{master.specialization}</div> : null}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Link href={masterHref} className="text-xs font-medium text-text underline underline-offset-2">
                  {UI_TEXT.publicStudio.openMaster}
                </Link>
                {hideBooking ? null : (
                  <Button asChild size="sm" className="ml-auto h-8 rounded-lg px-2.5 text-xs">
                    <Link href={bookingHref}>{UI_TEXT.publicStudio.book}</Link>
                  </Button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
