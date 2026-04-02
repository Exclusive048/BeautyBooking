"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { Calendar, MessageCircle, Search, Star, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { providerPublicUrl } from "@/lib/public-urls";
import type { ApiResponse } from "@/lib/types/api";
import type { BookingItem } from "@/features/cabinet/components/client-bookings-panel";

type Props = {
  displayName: string | null;
  avatarUrl: string | null;
};

const ACTIVE_STATUSES: BookingItem["status"][] = ["NEW", "PENDING", "CONFIRMED", "PREPAID", "CHANGE_REQUESTED", "STARTED", "IN_PROGRESS"];
const FINISHED_STATUSES: BookingItem["status"][] = ["FINISHED"];

function getStatusBadgeClass(status: BookingItem["status"]): string {
  if (status === "PENDING" || status === "NEW") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "CONFIRMED" || status === "PREPAID" || status === "STARTED") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  if (status === "FINISHED") return "bg-bg-input text-text-sec";
  if (status === "CANCELLED" || status === "REJECTED" || status === "NO_SHOW") return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (status === "CHANGE_REQUESTED") return "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300";
  return "bg-bg-input text-text-sec";
}

function statusLabel(status: BookingItem["status"]): string {
  const t = UI_TEXT.clientCabinet.booking;
  if (status === "PENDING" || status === "NEW") return t.pending;
  if (status === "CONFIRMED" || status === "PREPAID") return t.confirmed;
  if (status === "CHANGE_REQUESTED") return t.changeRequested;
  if (status === "IN_PROGRESS" || status === "STARTED") return t.inProgress;
  if (status === "FINISHED") return t.finished;
  return t.cancelled;
}

function getCountdown(startAtUtc: string): string {
  const t = UI_TEXT.clientCabinet.dashboard;
  const start = new Date(startAtUtc).getTime();
  const now = Date.now();
  const diffMs = start - now;
  if (diffMs <= 0) return "";
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) return `${diffMinutes} мин`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return t.bookingInHours(diffHours);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 1) return t.bookingTomorrow("");
  return t.bookingInDays(diffDays);
}

function getRelativeLabel(startAtUtc: string, viewerTz: string): string {
  const t = UI_TEXT.clientCabinet.dashboard;
  const start = new Date(startAtUtc);
  const now = new Date();
  const timeStr = UI_FMT.timeShort(startAtUtc, { timeZone: viewerTz });
  const startDate = new Date(start.toLocaleDateString("en-CA", { timeZone: viewerTz }));
  const todayDate = new Date(now.toLocaleDateString("en-CA", { timeZone: viewerTz }));
  const diffDays = Math.round((startDate.getTime() - todayDate.getTime()) / 86400000);
  if (diffDays === 0) return t.bookingToday(timeStr);
  if (diffDays === 1) return t.bookingTomorrow(timeStr);
  return UI_FMT.dateTimeShort(startAtUtc, { timeZone: viewerTz });
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number], delay: i * 0.06 },
  }),
};

export function ClientDashboard({ displayName, avatarUrl }: Props) {
  const t = UI_TEXT.clientCabinet;
  const viewerTz = useViewerTimeZoneContext();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/bookings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ bookings: BookingItem[] }> | null;
      if (!res.ok || !json || !json.ok) throw new Error(t.dashboard.loadFailed);
      setBookings(json.data.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.dashboard.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [t.dashboard.loadFailed]);

  useEffect(() => { void load(); }, [load]);

  const now = Date.now();

  const nextBooking = useMemo(() => {
    return bookings
      .filter((b) => ACTIVE_STATUSES.includes(b.status) && b.startAtUtc && new Date(b.startAtUtc).getTime() > now)
      .sort((a, b) => new Date(a.startAtUtc!).getTime() - new Date(b.startAtUtc!).getTime())[0] ?? null;
  }, [bookings, now]);

  const recentHistory = useMemo(() => {
    return bookings
      .filter((b) => FINISHED_STATUSES.includes(b.status) && b.startAtUtc)
      .sort((a, b) => new Date(b.startAtUtc!).getTime() - new Date(a.startAtUtc!).getTime())
      .slice(0, 5);
  }, [bookings]);

  // Unique providers from finished bookings for rebook
  const rebookProviders = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string; avatarUrl: string | null; publicUsername: string | null }[] = [];
    for (const b of recentHistory) {
      const p = b.masterProvider ?? b.provider;
      if (!seen.has(p.id)) {
        seen.add(p.id);
        result.push({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, publicUsername: p.publicUsername });
      }
      if (result.length >= 5) break;
    }
    return result;
  }, [recentHistory]);

  const initials = displayName
    ? displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-text-main sm:text-2xl">
              {displayName ? t.dashboard.greeting(displayName.split(" ")[0]) : t.dashboard.greetingDefault}
            </h1>
          </div>
          <div className="shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName ?? ""}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/30"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary-magenta/30 text-sm font-semibold text-primary">
                {initials}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" className="rounded-full gap-1.5">
            <Link href="/catalog">
              <Search className="h-3.5 w-3.5" />
              {t.dashboard.findMaster}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="rounded-full gap-1.5">
            <Link href="/cabinet/bookings">
              <Calendar className="h-3.5 w-3.5" />
              {t.nav.bookings}
            </Link>
          </Button>
        </div>
      </motion.div>

      {/* Loading / error states */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[22px] bg-bg-card/60" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : (
        <>
          {/* Next booking */}
          <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
            <h2 className="mb-3 text-base font-semibold text-text-main">{t.dashboard.nextBookingTitle}</h2>
            {nextBooking ? (
              <NextBookingCard booking={nextBooking} viewerTz={viewerTz} />
            ) : (
              <div className="lux-card flex items-center justify-between rounded-[22px] px-5 py-4">
                <span className="text-sm text-text-sec">{t.dashboard.noUpcomingTitle}</span>
                <Button asChild size="sm" className="rounded-full">
                  <Link href="/catalog">{t.dashboard.noUpcomingCta}</Link>
                </Button>
              </div>
            )}
          </motion.div>

          {/* Rebook */}
          {rebookProviders.length > 0 ? (
            <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
              <h2 className="mb-3 text-base font-semibold text-text-main">{t.dashboard.rebookTitle}</h2>
              <div className="overflow-x-auto scrollbar-hide">
                <div className="flex min-w-max gap-3 pb-1">
                  {rebookProviders.map((p) => {
                    const href = providerPublicUrl({ id: p.id, publicUsername: p.publicUsername }, "dashboard-rebook");
                    return (
                      <Link
                        key={p.id}
                        href={href}
                        className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 rounded-2xl p-2 transition-colors hover:bg-bg-input/60"
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-full bg-muted ring-2 ring-border-subtle">
                          {p.avatarUrl ? (
                            <Image src={p.avatarUrl} alt={p.name} width={48} height={48} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xs font-semibold text-primary">
                              {p.name[0]}
                            </div>
                          )}
                        </div>
                        <span className="w-full truncate text-center text-[11px] leading-tight text-text-sec">
                          {p.name.split(" ")[0]}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : null}

          {/* Recent history */}
          {recentHistory.length > 0 ? (
            <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-main">{t.dashboard.recentTitle}</h2>
                <Link
                  href="/cabinet/bookings"
                  className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {t.dashboard.allBookings}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="space-y-2">
                {recentHistory.map((b) => {
                  const masterTarget = b.masterProvider ?? (b.provider.type === "MASTER" ? b.provider : null);
                  const displayName = masterTarget?.name ?? b.provider.name;
                  const slotText = b.startAtUtc ? UI_FMT.dateTimeShort(b.startAtUtc, { timeZone: viewerTz }) : "";
                  return (
                    <div
                      key={b.id}
                      className="lux-card flex items-center gap-3 rounded-[18px] px-4 py-3"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                        {masterTarget?.avatarUrl ? (
                          <Image src={masterTarget.avatarUrl} alt={displayName} width={36} height={36} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-text-sec">{displayName[0]}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-main">{displayName}</div>
                        <div className="truncate text-xs text-text-sec">{b.service.name} · {slotText}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeClass(b.status)}`}>
                        {statusLabel(b.status)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </>
      )}
    </div>
  );
}

function NextBookingCard({ booking, viewerTz }: { booking: BookingItem; viewerTz: string }) {
  const t = UI_TEXT.clientCabinet;
  const masterTarget = booking.masterProvider ?? (booking.provider.type === "MASTER" ? booking.provider : null);
  const displayProviderName = masterTarget?.name ?? booking.provider.name;
  const bookingUrl = providerPublicUrl(
    { id: booking.provider.id, publicUsername: booking.provider.publicUsername },
    "dashboard-next"
  );
  const countdown = booking.startAtUtc ? getCountdown(booking.startAtUtc) : "";
  const relativeLabel = booking.startAtUtc ? getRelativeLabel(booking.startAtUtc, viewerTz) : "";
  const priceRub = booking.service.price > 0 ? Math.round(booking.service.price / 100) : null;

  return (
    <div className="lux-card overflow-hidden rounded-[22px]">
      {/* Gradient top strip */}
      <div className="h-1 w-full bg-gradient-to-r from-primary via-primary-hover to-primary-magenta" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-primary/20">
            {masterTarget?.avatarUrl ? (
              <Image src={masterTarget.avatarUrl} alt={displayProviderName} width={48} height={48} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-semibold text-primary">
                {displayProviderName[0]}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-text-main">{displayProviderName}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusBadgeClass(booking.status)}`}>
                {statusLabel(booking.status)}
              </span>
            </div>
            <div className="mt-0.5 text-sm text-text-sec">
              {booking.service.name}
              {priceRub ? ` · ${priceRub} ₽` : ""}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border-subtle/60 bg-bg-input/50 px-3 py-2">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-medium text-text-main">{relativeLabel}</span>
          {countdown ? (
            <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {countdown}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" className="rounded-full flex-1 sm:flex-none">
            <Link href={bookingUrl}>
              <Star className="h-3.5 w-3.5 mr-1" />
              {t.dashboard.findMaster.replace("Найти", "Открыть")}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="rounded-full gap-1.5 flex-1 sm:flex-none">
            <Link href={`/cabinet/bookings?bookingId=${booking.id}&chat=open`}>
              <MessageCircle className="h-3.5 w-3.5" />
              {t.booking.chatToggle}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
