"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Calendar,
  CalendarDays,
  Wallet,
  Sparkles,
  MapPin,
  MessageSquare,
  Download,
  Repeat,
  Star,
  X,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FocalImage } from "@/components/ui/focal-image";
import { useConfirm } from "@/hooks/use-confirm";
import { moneyRUB } from "@/lib/format";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  ClientBookingDTO,
  ClientBookingsPayload,
} from "@/lib/client-cabinet/bookings.service";
import { groupBookingsByMonth } from "./lib/group-by-month";
import { buildYandexMapsLink } from "./lib/maps-link";
import { ClientRescheduleModal } from "./client-reschedule-modal";
import { ClientReviewModal } from "./client-review-modal";

const T = UI_TEXT.clientCabinet.bookingsPage;
const STATUS_T = UI_TEXT.clientCabinet.booking;

type Filter = {
  status: "all" | "upcoming" | "finished" | "cancelled";
  search: string;
};

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(async (res) => {
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "load_failed");
    return json.data as ClientBookingsPayload;
  });

export function ClientBookingsPage() {
  const [filter, setFilter] = useState<Filter>({ status: "all", search: "" });
  const [rescheduleTarget, setRescheduleTarget] = useState<ClientBookingDTO | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ClientBookingDTO | null>(null);
  const { confirm, modal: confirmModal } = useConfirm();

  const queryString = new URLSearchParams({
    status: filter.status,
    ...(filter.search ? { search: filter.search } : {}),
  }).toString();

  const { data, mutate, isLoading, error } = useSWR<ClientBookingsPayload>(
    `/api/cabinet/user/bookings?${queryString}`,
    fetcher,
  );

  const bookings = useMemo(() => data?.bookings ?? [], [data]);
  const kpi = data?.kpi;
  const months = useMemo(() => groupBookingsByMonth(bookings), [bookings]);

  const statusCounts = useMemo(() => {
    const all = bookings.length;
    const upcoming = bookings.filter((b) => b.isUpcoming).length;
    const finished = bookings.filter((b) => b.isFinished).length;
    const cancelled = bookings.filter((b) => b.isCancelled).length;
    return { all, upcoming, finished, cancelled };
  }, [bookings]);

  async function handleCancel(booking: ClientBookingDTO) {
    const ok = await confirm({
      title: T.cancelConfirmTitle,
      message: T.cancelConfirmBody,
      confirmLabel: T.cancelConfirmAction,
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      await mutate();
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-text-main lg:text-4xl">
          {T.title}
        </h1>
        <p className="mt-1 text-sm text-text-sec">{T.subtitle}</p>
      </header>

      <KpiCards kpi={kpi} isLoading={isLoading} />

      <FilterBar
        filter={filter}
        onChange={setFilter}
        counts={statusCounts}
      />

      {error ? (
        <Card className="p-6 text-center text-sm text-text-sec">
          {UI_TEXT.clientCabinet.bookingsPanel.failedToLoad}
        </Card>
      ) : isLoading ? (
        <BookingsListSkeleton />
      ) : bookings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {months.map((month) => (
            <section key={month.key}>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                {month.label}
              </div>
              <ul className="space-y-3">
                {month.bookings.map((b) => (
                  <li key={b.id}>
                    <BookingRow
                      booking={b}
                      onCancel={() => handleCancel(b)}
                      onReschedule={() => setRescheduleTarget(b)}
                      onReview={() => setReviewTarget(b)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {confirmModal}

      {rescheduleTarget ? (
        <ClientRescheduleModal
          key={`reschedule-${rescheduleTarget.id}`}
          booking={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={() => {
            setRescheduleTarget(null);
            mutate();
          }}
        />
      ) : null}

      {reviewTarget ? (
        <ClientReviewModal
          key={`review-${reviewTarget.id}`}
          booking={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSuccess={() => {
            setReviewTarget(null);
            mutate();
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function KpiCards({
  kpi,
  isLoading,
}: {
  kpi: ClientBookingsPayload["kpi"] | undefined;
  isLoading: boolean;
}) {
  const next = kpi?.upcomingNext;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        icon={CalendarDays}
        label={T.kpiAll}
        value={isLoading ? "—" : String(kpi?.totalCount ?? 0)}
      />
      <Card
        className={`relative p-4 ${next ? "border-primary/40 bg-bg-input/30" : ""}`}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.kpiUpcoming}
        </div>
        <div className="mt-1 font-display text-base text-text-main">
          {isLoading ? "—" : next ? formatRelativeDateTime(next.whenIso) : "—"}
        </div>
        {next ? (
          <div className="mt-0.5 truncate text-xs text-text-sec">
            {next.providerName}
          </div>
        ) : null}
      </Card>
      <KpiCard
        icon={Sparkles}
        label={T.kpiFinished}
        value={isLoading ? "—" : String(kpi?.finishedCount ?? 0)}
      />
      <KpiCard
        icon={Wallet}
        label={T.kpiSpent3m}
        value={isLoading ? "—" : moneyRUB(kpi?.spentLast90dKopeks ?? 0)}
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-text-sec" aria-hidden />
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {label}
        </div>
      </div>
      <div className="mt-1 font-display text-2xl text-text-main">{value}</div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function FilterBar({
  filter,
  onChange,
  counts,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  counts: { all: number; upcoming: number; finished: number; cancelled: number };
}) {
  const options: Array<{ value: Filter["status"]; label: string; count: number }> = [
    { value: "all", label: T.filterAll, count: counts.all },
    { value: "upcoming", label: T.filterUpcoming, count: counts.upcoming },
    { value: "finished", label: T.filterFinished, count: counts.finished },
    { value: "cancelled", label: T.filterCancelled, count: counts.cancelled },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt.value === filter.status;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...filter, status: opt.value })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-primary text-white"
                  : "bg-bg-input text-text-sec hover:bg-bg-input/70 hover:text-text-main"
              }`}
            >
              <span>{opt.label}</span>
              <span
                className={`font-mono text-xs ${
                  active ? "text-white/80" : "text-text-sec/70"
                }`}
              >
                {opt.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative ml-auto w-full sm:w-72">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          aria-hidden
        />
        <Input
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder={T.searchPlaceholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function BookingRow({
  booking,
  onCancel,
  onReschedule,
  onReview,
}: {
  booking: ClientBookingDTO;
  onCancel: () => void;
  onReschedule: () => void;
  onReview: () => void;
}) {
  return (
    <Card
      className={`flex flex-col gap-4 p-4 transition sm:flex-row sm:items-start ${
        booking.isToday ? "border-primary/40 ring-1 ring-primary/20" : ""
      }`}
    >
      <DateBadge isoStart={booking.startAtUtc} highlight={booking.isToday} />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} isToday={booking.isToday} />
          <span className="font-mono text-xs text-text-sec">
            {formatDuration(booking.durationMin)}
          </span>
        </div>

        <div className="font-semibold text-text-main">{booking.service.name}</div>

        <div className="flex items-center gap-2 text-sm text-text-sec">
          {booking.provider.avatarUrl ? (
            <FocalImage
              src={booking.provider.avatarUrl}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <span className="truncate">{booking.provider.name}</span>
        </div>

        {booking.address ? (
          <div className="flex items-center gap-1 text-xs text-text-sec">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{booking.address}</span>
          </div>
        ) : null}

        <BookingActions
          booking={booking}
          onCancel={onCancel}
          onReschedule={onReschedule}
          onReview={onReview}
        />
      </div>

      <div className="text-right sm:min-w-[6rem]">
        <div className="font-mono text-lg font-semibold text-text-main">
          {moneyRUB(booking.service.priceSnapshot)}
        </div>
      </div>
    </Card>
  );
}

function DateBadge({
  isoStart,
  highlight,
}: {
  isoStart: string | null;
  highlight: boolean;
}) {
  if (!isoStart) {
    return (
      <div className="w-16 shrink-0 rounded-2xl bg-bg-input p-3 text-center text-xs text-text-sec">
        —
      </div>
    );
  }
  const d = new Date(isoStart);
  const month = d.toLocaleString("ru-RU", { month: "short" }).toUpperCase().replace(".", "");
  const day = d.getDate();
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      className={`flex w-20 shrink-0 flex-col items-center gap-0.5 rounded-2xl py-2 text-center sm:w-16 ${
        highlight
          ? "bg-brand-gradient text-white"
          : "border border-border-subtle/60 bg-bg-input text-text-main"
      }`}
    >
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          highlight ? "text-white/80" : "text-text-sec"
        }`}
      >
        {month}
      </span>
      <span className="font-display text-2xl leading-none">{day}</span>
      <span
        className={`font-mono text-[11px] ${
          highlight ? "text-white/80" : "text-text-sec"
        }`}
      >
        {time}
      </span>
    </div>
  );
}

function StatusBadge({
  status,
  isToday,
}: {
  status: ClientBookingDTO["status"];
  isToday: boolean;
}) {
  if (isToday && (status === "CONFIRMED" || status === "PREPAID")) {
    return <Badge variant="info">Сегодня</Badge>;
  }
  switch (status) {
    case "NEW":
    case "PENDING":
      return <Badge variant="warning">{STATUS_T.waitsMaster}</Badge>;
    case "CHANGE_REQUESTED":
      return <Badge variant="warning">{STATUS_T.changeRequested}</Badge>;
    case "CONFIRMED":
    case "PREPAID":
      return <Badge variant="info">{STATUS_T.confirmed}</Badge>;
    case "IN_PROGRESS":
    case "STARTED":
      return <Badge variant="info">{STATUS_T.inProgress}</Badge>;
    case "FINISHED":
      return <Badge variant="success">{STATUS_T.finished}</Badge>;
    case "CANCELLED":
    case "REJECTED":
    case "NO_SHOW":
      return <Badge variant="default">{STATUS_T.cancelled}</Badge>;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */

function BookingActions({
  booking,
  onCancel,
  onReschedule,
  onReview,
}: {
  booking: ClientBookingDTO;
  onCancel: () => void;
  onReschedule: () => void;
  onReview: () => void;
}) {
  const chatHref = booking.chatSlug ? `/cabinet/messages?c=${booking.chatSlug}` : null;
  const mapsHref =
    booking.address && !!booking.address.trim()
      ? buildYandexMapsLink(booking.address)
      : null;
  const rebookHref = booking.provider.publicUsername
    ? `/u/${booking.provider.publicUsername}/booking?service=${booking.service.id}`
    : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {booking.isUpcoming ? (
        <>
          {chatHref ? (
            <ActionLink href={chatHref} icon={MessageSquare} label={T.actionChat} variant="primary" />
          ) : null}
          <ActionButton icon={Calendar} label={T.actionReschedule} onClick={onReschedule} />
          <ActionLink
            href={`/api/bookings/${booking.id}/ics`}
            icon={Download}
            label={T.actionIcs}
            download
          />
          {mapsHref ? (
            <ActionLink href={mapsHref} icon={MapPin} label={T.actionRoute} target="_blank" />
          ) : null}
          <ActionButton
            icon={X}
            label={T.actionCancel}
            onClick={onCancel}
            variant="danger"
          />
        </>
      ) : null}

      {booking.isFinished ? (
        <>
          {booking.canReview ? (
            <ActionButton
              icon={Star}
              label={T.actionReview}
              onClick={onReview}
              variant="primary"
            />
          ) : null}
          {rebookHref ? (
            <ActionLink href={rebookHref} icon={Repeat} label={T.actionRebook} />
          ) : null}
          {chatHref ? (
            <ActionLink href={chatHref} icon={MessageSquare} label={T.actionContact} />
          ) : null}
        </>
      ) : null}

      {booking.isCancelled && chatHref ? (
        <ActionLink href={chatHref} icon={MessageSquare} label={T.actionContact} />
      ) : null}
    </div>
  );
}

type ActionVariant = "default" | "primary" | "danger";

function actionClass(variant: ActionVariant): string {
  switch (variant) {
    case "primary":
      return "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15";
    case "danger":
      return "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30";
    default:
      return "text-text-sec hover:bg-bg-input/70 hover:text-text-main";
  }
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: typeof Calendar;
  label: string;
  onClick: () => void;
  variant?: ActionVariant;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-1.5 text-xs font-medium transition ${actionClass(
        variant,
      )}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

function ActionLink({
  href,
  icon: Icon,
  label,
  variant = "default",
  target,
  download,
}: {
  href: string;
  icon: typeof Calendar;
  label: string;
  variant?: ActionVariant;
  target?: string;
  download?: boolean;
}) {
  const external = target === "_blank";
  if (download || external) {
    return (
      <a
        href={href}
        target={target}
        rel={external ? "noopener noreferrer" : undefined}
        download={download}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-1.5 text-xs font-medium transition ${actionClass(
          variant,
        )}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-1.5 text-xs font-medium transition ${actionClass(
        variant,
      )}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-4 p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-bg-input">
        <Calendar className="h-6 w-6 text-text-sec" aria-hidden />
      </div>
      <div className="font-display text-lg text-text-main">{T.empty}</div>
      <Link href="/catalog">
        <Button variant="primary">{T.emptyCta}</Button>
      </Link>
    </Card>
  );
}

function BookingsListSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Card className="h-32 animate-pulse bg-bg-input/40" />
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

function formatRelativeDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (d >= today && d < tomorrow) return `Сегодня, ${time}`;
  if (d >= tomorrow && d < dayAfter) return `Завтра, ${time}`;
  return (
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) +
    ", " +
    time
  );
}

function formatDuration(minutes: number): string {
  if (minutes <= 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
