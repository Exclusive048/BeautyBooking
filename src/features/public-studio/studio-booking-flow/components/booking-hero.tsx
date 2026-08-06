"use client";

import Link from "next/link";
import { ChevronLeft, Clock, MapPin, Star, Users } from "lucide-react";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { StudioMaster } from "@/features/booking/lib/studio-booking";
import { UI_TEXT } from "@/lib/ui/text";

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
      <div className="relative h-28 bg-brand-gradient sm:h-32">
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
        {studio.address ? (
          <div className="absolute left-4 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs text-white backdrop-blur">
            <MapPin className="h-3 w-3" aria-hidden />
            <span className="truncate max-w-[16ch] sm:max-w-[28ch]">{studio.address}</span>
          </div>
        ) : null}
        {studio.rating && studio.rating > 0 ? (
          <div className="absolute right-4 top-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            <Star className="h-3 w-3 text-amber-300" aria-hidden />
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
          className="-mt-14 flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl border-4 border-bg-card bg-gradient-to-br from-pink-200 via-pink-400 to-primary/80 font-display text-3xl font-semibold text-primary shadow-brand"
          aria-hidden
        >
          {initials || "S"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
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
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3 w-3" aria-hidden />
              {UI_TEXT.bookingWidget.hero.mastersCount.replace("{count}", String(masters.length))}
            </span>
          </div>
        </div>

        {prefilledMaster ? (
          <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-amber-400/[0.08] px-3 py-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-semibold text-white" aria-hidden>
              {prefilledMaster.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-xs leading-tight">
              <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
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
                  className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg-card bg-primary text-[11px] font-semibold text-white first:ml-0"
                  style={{ zIndex: visibleMasters.length - i }}
                  title={m.name}
                >
                  {m.name.charAt(0).toUpperCase()}
                </span>
              ))}
              {rest > 0 ? (
                <span className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg-card bg-bg-card text-[11px] font-semibold text-text-muted">
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
