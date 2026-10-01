"use client";

import Link from "next/link";
import { ChevronLeft, Clock, MapPin, Star, Users } from "lucide-react";
import { ResilientImage } from "@/components/ui/resilient-image";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { StudioMaster } from "@/features/booking/lib/studio-booking";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import { MasterAvatar } from "./master-avatar";

type Props = {
  studio: ProviderProfileDto;
  masters: StudioMaster[];
  prefilledMaster: StudioMaster | null;
  backHref: string;
};

export function BookingHero({ studio, masters, prefilledMaster, backHref }: Props) {
  const initials = studio.name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const visibleMasters = masters.slice(0, 6);
  const rest = masters.length - visibleMasters.length;
  const crop = studio.bannerCrop;

  const initialsTile = (
    <span className="flex h-full w-full items-center justify-center font-display text-3xl font-semibold text-primary">
      {initials || "S"}
    </span>
  );

  return (
    <div>
      {/* FIX-VISUAL-POLISH F1: the back-link was `absolute right-4 top-4` and
          overlapped the rating pill (`absolute right-4 top-3`) in the band's
          top-right corner (the reported "doubled/colliding" glyphs). Moved out
          of the band to a clean breadcrumb-style link above the card — the
          address (top-left) + rating (top-right) chips no longer collide. */}
      <Link
        href={backHref}
        className="mb-3 inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {UI_TEXT.bookingWidget.backToStudio}
      </Link>
      <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-sm">
      {/* STUDIO-BOOKING-BANNER (2026-09-24): баннер, загруженный в кабинете,
          а не декоративная полоса. На телефоне бокс 16:9 — те же пропорции,
          что у рамки кроппера; шире — фиксированная высота, и кадр наводится
          на центр выбранной области (`focal`: точная подгонка исказила бы
          картинку в боксе других пропорций). Без баннера — прежняя полоса. */}
      <div
        className={cn(
          "relative bg-brand-gradient",
          studio.bannerUrl ? "aspect-[16/9] sm:aspect-auto sm:h-60" : "h-28 sm:h-32",
        )}
      >
        {studio.bannerUrl ? (
          <>
            <ResilientImage
              src={studio.bannerUrl}
              alt=""
              sizes="(min-width: 1024px) 800px, 100vw"
              priority
              cropX={crop?.x}
              cropY={crop?.y}
              cropWidth={crop?.width}
              cropHeight={crop?.height}
              className="object-cover"
            />
            {/* Скрим сверху: чипы адреса и рейтинга читаются на любом фото. */}
            <div
              className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-transparent"
              aria-hidden
            />
          </>
        ) : (
          <div className="absolute inset-0 opacity-30" aria-hidden>
            <svg width="100%" height="100%" viewBox="0 0 800 144" preserveAspectRatio="none">
              <defs>
                <pattern id="bw-dots" width="32" height="32" patternUnits="userSpaceOnUse">
                  <circle cx="16" cy="16" r="1.2" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#bw-dots)" />
            </svg>
          </div>
        )}
        {studio.address ? (
          <div className="absolute left-4 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs text-white backdrop-blur">
            <MapPin className="h-3 w-3" aria-hidden />
            <span className="truncate max-w-[16ch] sm:max-w-[28ch]">{studio.address}</span>
          </div>
        ) : null}
        {studio.rating && studio.rating > 0 ? (
          <div className="absolute right-4 top-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            <Star className="h-3 w-3 text-rating" aria-hidden />
            <span>
              {UI_TEXT.bookingWidget.hero.ratingLabel
                .replace("{rating}", studio.rating.toFixed(1))
                .replace("{reviews}", String(studio.reviews ?? 0))}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-4 p-5 sm:gap-6 sm:p-6">
        <div
          // UI-10: инициалы — `text-primary`, а это САНКЦИОНИРОВАННАЯ пара к
          // ФИКСИРОВАННОЙ светлой заливке (`button.tsx` variant `inverted`:
          // бургунди в обеих темах, светлым не становится). Ломала пару не
          // подпись, а последний стоп градиента: `to-primary/80` тематизируем
          // и в своём же цвете, поэтому нижний правый угол плашки уезжал в тот
          // же бургунди, что и буквы, — 1.59:1 в светлой и 1.11:1 в тёмной, то
          // есть инициалы там пропадали в ОБЕИХ темах, а не только в тёмной.
          // Стопы сведены к встроенной розовой шкале: заливка стала полностью
          // фиксированной (правило пары соблюдено буквально), градиент так же
          // углубляется к углу, а худшая точка теперь 4.52 / 4.09.
          className="relative -mt-14 h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border-4 border-bg-card bg-gradient-to-br from-primary-magenta/30 via-primary-magenta/50 to-primary-magenta/70 shadow-brand"
          aria-hidden
        >
          {/* Аватар уже вырезан сервером по сохранённой области (CROP-PUBLIC-01). */}
          {studio.avatarUrl ? (
            <ResilientImage
              src={studio.avatarUrl}
              alt=""
              sizes="80px"
              className="object-cover"
              fallback={initialsTile}
            />
          ) : (
            initialsTile
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="eyebrow text-text-muted">
            {UI_TEXT.bookingWidget.hero.studioLabel}
            {studio.publicUsername ? ` · @${studio.publicUsername}` : ""}
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight text-text sm:text-3xl">
            {studio.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            {studio.availableToday ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" aria-hidden />
                <span>{UI_TEXT.publicStudio.availableToday}</span>
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3 w-3" aria-hidden />
              {UI_TEXT.bookingWidget.hero.mastersCount.replace("{count}", String(masters.length))}
            </span>
          </div>
        </div>

        {prefilledMaster ? (
          <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-brand-accent/[0.08] px-3 py-2.5">
            <MasterAvatar
              name={prefilledMaster.name}
              avatarUrl={prefilledMaster.avatarUrl}
              sizePx={40}
              className="h-10 w-10 text-sm"
            />
            <div className="text-xs leading-tight">
              <div className="eyebrow text-text-muted">
                {UI_TEXT.bookingWidget.hero.bookingToMaster}
              </div>
              <div className="text-sm font-semibold text-text">{prefilledMaster.name}</div>
            </div>
          </div>
        ) : masters.length > 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-muted/60 px-3 py-2.5">
            <div className="flex" aria-hidden>
              {visibleMasters.map((m, i) => (
                <span
                  key={m.id}
                  className="relative -ml-2 first:ml-0"
                  style={{ zIndex: visibleMasters.length - i }}
                  title={m.name}
                >
                  <MasterAvatar
                    name={m.name}
                    avatarUrl={m.avatarUrl}
                    sizePx={32}
                    className="h-8 w-8 border-2 border-bg-card text-2xs"
                  />
                </span>
              ))}
              {rest > 0 ? (
                <span className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg-card bg-bg-card text-2xs font-semibold text-text-muted">
                  +{rest}
                </span>
              ) : null}
            </div>
            <div className="text-xs leading-tight">
              <div className="font-semibold text-text">{UI_TEXT.bookingWidget.hero.teamPick}</div>
              <div className="text-text-muted">{UI_TEXT.bookingWidget.hero.teamPickHint}</div>
            </div>
          </div>
        ) : null}
      </div>

      </div>
    </div>
  );
}
