"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSetupCard } from "@/features/cabinet/components/app-setup-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResilientImage } from "@/components/ui/resilient-image";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { useConfirm } from "@/hooks/use-confirm";
import { useFocusHighlight } from "@/hooks/use-focus-highlight";
import { ICS_FAILURE_PARAM, type IcsExportFailure } from "@/lib/bookings/ics-export-outcome";
import { moneyRUBFromKopeks } from "@/lib/format";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
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
  fetchJson<ClientBookingsPayload>(url, { credentials: "include" });

/** REVIEW-PROMPT-01 — deep-link «открыть форму отзыва по этой записи». */
const REVIEW_PARAM = "review";

export function ClientBookingsPage() {
  const [filter, setFilter] = useState<Filter>({ status: "all", search: "" });
  const [rescheduleTarget, setRescheduleTarget] = useState<ClientBookingDTO | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ClientBookingDTO | null>(null);
  // RESCHEDULE-CLIENT-APPROVAL: ответ на предложенный мастером перенос —
  // состояние одной карточки (какая занята / какая с ошибкой).
  const [answerState, setAnswerState] = useState<{
    id: string;
    busy: boolean;
    error: string | null;
  } | null>(null);
  // CANCEL-DURING-RESCHEDULE: отказ отмены раньше глотался — кнопка просто
  // ничего не делала. Теперь то же состояние карточки, что и у ответа на перенос.
  const [cancelState, setCancelState] = useState<{
    id: string;
    busy: boolean;
    error: string | null;
  } | null>(null);
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

  // FIX-R2-06-B: honor `?focus=<bookingId>` deep-link — scroll-to + highlight
  // the row once the SWR list has loaded (rows aren't in the DOM on mount).
  useFocusHighlight(bookings.length);

  // REVIEW-PROMPT-01: `?review=<bookingId>` из запроса отзыва (уведомление,
  // пуш, «Ждут отзыва») открывает форму сразу. Раньше параметр не читал никто:
  // клиент попадал в общий список и искал запись сам. Параметр снимается после
  // первой попытки — иначе форма открывалась бы заново после каждого
  // обновления списка. `replaceState(null, …)` — см. schedule-view-state.ts:
  // состояние с `__NA` патч Next считает своим и не синхронизирует роутер.
  useEffect(() => {
    if (bookings.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const reviewId = params.get(REVIEW_PARAM);
    if (!reviewId) return;
    const target = bookings.find((b) => b.id === reviewId);
    if (target?.canReview) startTransition(() => setReviewTarget(target));
    params.delete(REVIEW_PARAM);
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  }, [bookings]);

  // FIX-B18: `GET /api/bookings/[id]/ics` — навигация (ссылка «В календарь»), и
  // её отказы раньше рисовали в окне JSON-конверт. Теперь она возвращает
  // браузер сюда с `?ics=<исход>`. Форма читается из `window.location.search`,
  // а не `useSearchParams()` — последний требует Suspense-границы у хозяина
  // страницы (та же причина, что в `vk-notifications.tsx`). `?focus=` при этом
  // остаётся в URL: подсветка строки — часть возврата «к своей записи».
  const [icsError, setIcsError] = useState<string | null>(null);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(ICS_FAILURE_PARAM);
    if (!raw) return;
    const messages: Record<Exclude<IcsExportFailure, "auth_required">, string> = {
      not_found: T.icsErrorNotFound,
      forbidden: T.icsErrorForbidden,
      no_time: T.icsErrorNoTime,
      failed: T.icsErrorFailed,
    };
    const message = messages[raw as keyof typeof messages];
    if (!message) return;
    // `startTransition`, а не голый setState: правило `react-hooks/
    // set-state-in-effect` (React Compiler) справедливо запрещает синхронное
    // обновление в теле эффекта. Здесь это и по смыслу верно — баннер об
    // отказе не срочнее списка записей. ⚠️ Соседний `vk-notifications.tsx`
    // делает то же самое голым setState и правило там молчит: линтер
    // пропускает компоненты, которые не смог скомпилировать, то есть его
    // тишина — не разрешение. Копировать ту форму не следует.
    startTransition(() => setIcsError(message));
    const url = new URL(window.location.href);
    url.searchParams.delete(ICS_FAILURE_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const statusCounts = useMemo(() => {
    const all = bookings.length;
    const upcoming = bookings.filter((b) => b.isUpcoming).length;
    const finished = bookings.filter((b) => b.isFinished).length;
    const cancelled = bookings.filter((b) => b.isCancelled).length;
    return { all, upcoming, finished, cancelled };
  }, [bookings]);

  // RESCHEDULE-CLIENT-APPROVAL: `/confirm` применяет предложенное мастером
  // время, `/decline-reschedule` возвращает прежнее (инв. #32 — тот же
  // backend, что у мастера). Серверная строка показывается дословно: отказы
  // здесь действенные («статус изменился — обновите страницу», «время уже
  // занято»), канон «попробуйте ещё раз» на них был бы неверным советом.
  async function handleRescheduleAnswer(booking: ClientBookingDTO, answer: "accept" | "decline") {
    setAnswerState({ id: booking.id, busy: true, error: null });
    try {
      await fetchJson(
        `/api/bookings/${booking.id}/${answer === "accept" ? "confirm" : "decline-reschedule"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      setAnswerState(null);
      await mutate();
    } catch (error) {
      setAnswerState({
        id: booking.id,
        busy: false,
        error: serverMessageOr(error, T.rescheduleAnswerFailed),
      });
    }
  }

  async function handleCancel(booking: ClientBookingDTO) {
    // PACKAGE-CANCEL-UI-01: услуга из пакета отменяется только вместе с пакетом.
    // Раньше «Отменить» на ней отвечало 409 «Этот пакет отменяется целиком» —
    // и следующего шага не было: отмену пакета не вызывала ни одна кнопка.
    const packageId = booking.bookingPackageId;
    const ok = await confirm(
      packageId
        ? {
            title: T.cancelPackageConfirmTitle,
            message: T.cancelPackageConfirmBody,
            confirmLabel: T.cancelPackageConfirmAction,
            variant: "danger",
          }
        : {
            title: T.cancelConfirmTitle,
            message: T.cancelConfirmBody,
            confirmLabel: T.cancelConfirmAction,
            variant: "danger",
          },
    );
    if (!ok) return;
    setCancelState({ id: booking.id, busy: true, error: null });
    try {
      const url = packageId
        ? `/api/bookings/package/${encodeURIComponent(packageId)}/cancel`
        : `/api/bookings/${booking.id}/cancel`;
      await fetchJson(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setCancelState(null);
      await mutate();
    } catch (error) {
      // Отказы отмены действенные (окно 60 минут, срок отмены, «запись уже
      // изменилась — обновите страницу») — серверная строка дословно (FIX-C8).
      setCancelState({
        id: booking.id,
        busy: false,
        error: serverMessageOr(error, T.cancelFailed),
      });
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

      {/* PWA-ONBOARDING-01: напоминания о визитах приходят пушем — поэтому и клиенту. */}
      <AppSetupCard />

      <KpiCards kpi={kpi} isLoading={isLoading} />

      <FilterBar
        filter={filter}
        onChange={setFilter}
        counts={statusCounts}
      />

      {icsError ? (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-text-main">
          {icsError}
        </Card>
      ) : null}

      {error ? (
        <Card className="p-6 text-center text-sm text-text-sec">
          {UI_TEXT.clientCabinet.bookingsPanel.failedToLoad}
        </Card>
      ) : isLoading ? (
        <BookingsListSkeleton />
      ) : bookings.length === 0 ? (
        <BookingsEmptyState />
      ) : (
        <div className="space-y-8" data-testid="bookings-list">
          {months.map((month) => (
            <section key={month.key}>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                {month.label}
              </div>
              <ul className="space-y-3">
                {month.bookings.map((b) => (
                  <li key={b.id} data-focus-id={b.id} data-testid="booking-row">
                    <BookingRow
                      booking={b}
                      onCancel={() => handleCancel(b)}
                      onReschedule={() => setRescheduleTarget(b)}
                      onReview={() => setReviewTarget(b)}
                      onAnswerReschedule={(answer) => handleRescheduleAnswer(b, answer)}
                      answerBusy={answerState?.id === b.id && answerState.busy}
                      answerError={answerState?.id === b.id ? answerState.error : null}
                      cancelBusy={cancelState?.id === b.id && cancelState.busy}
                      cancelError={cancelState?.id === b.id ? cancelState.error : null}
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
    <StatTileGrid columns={4}>
      <KpiCard
        icon={CalendarDays}
        label={T.kpiAll}
        value={isLoading ? "—" : String(kpi?.totalCount ?? 0)}
      />
      {/* FIX-POLISH-01 (walkthrough #6): the next-appointment card is the most
          actionable KPI, so when there IS one it gets a brand-gradient CTA
          treatment (fixed burgundy→raspberry in both themes → white text is
          theme-stable, no dark-flip trap). Empty state stays a quiet plain
          card. `bg-brand-gradient` is a background-IMAGE, so it paints over
          Card's `bg-bg-card` regardless of cn order. */}
      {/* PWA-FIX-10: плитка «ближайшая запись» остаётся своей — у неё
          бренд-градиент и белый текст, которых у примитива нет, — но её ритм
          выровнен по `<StatTile>`: те же отступы `p-3 sm:p-4`, та же подпись
          `text-[11px]` вместо mono-uppercase с трекингом (на 375px он был
          заметно шире и ломал ряд). */}
      <Card
        className={
          next
            ? "relative overflow-hidden bg-brand-gradient p-3 shadow-lg sm:p-4"
            : "relative p-3 sm:p-4"
        }
      >
        <div
          className={`text-[11px] leading-tight sm:text-xs ${
            next ? "text-white/85" : "text-text-sec"
          }`}
        >
          {T.kpiUpcoming}
        </div>
        <div
          className={`mt-1.5 font-display text-base leading-tight ${
            next ? "font-semibold text-white" : "text-text-main"
          }`}
        >
          {isLoading ? "—" : next ? formatRelativeDateTime(next.whenIso, next.timeZone) : "—"}
        </div>
        {next ? (
          <div className="mt-0.5 truncate text-[11px] leading-tight text-white/75">
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
        value={isLoading ? "—" : moneyRUBFromKopeks(kpi?.spentLast90dKopeks ?? 0)}
      />
    </StatTileGrid>
  );
}

// PWA-FIX-10 - общий StatTile вместо локальной плитки кабинета клиента.
function KpiCard({
  icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return <StatTile icon={icon} label={label} value={value} />;
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
  onAnswerReschedule,
  answerBusy,
  answerError,
  cancelBusy,
  cancelError,
}: {
  booking: ClientBookingDTO;
  onCancel: () => void;
  onReschedule: () => void;
  onReview: () => void;
  onAnswerReschedule: (answer: "accept" | "decline") => void;
  answerBusy: boolean;
  answerError: string | null;
  cancelBusy: boolean;
  cancelError: string | null;
}) {
  // QA-107/FIX-22: the time is shown in the SALON's timezone everywhere; show
  // the explicit «(город, GMT+N)» label only when the viewer's zone differs
  // (same-zone case stays clean).
  const viewerTz = useViewerTimeZoneContext();
  const salonTz = booking.provider.timezone;
  const showZone =
    !!booking.startAtUtc &&
    zonesDifferForViewer({
      iso: booking.startAtUtc,
      salonTimeZone: salonTz,
      viewerTimeZone: viewerTz,
    });
  const zoneLabel = showZone
    ? formatZoneLabel({ iso: booking.startAtUtc, timeZone: salonTz })
    : "";

  return (
    <Card
      className={`flex flex-col gap-4 p-4 transition sm:flex-row sm:items-start ${
        booking.isToday ? "border-primary/40 ring-1 ring-primary/20" : ""
      }`}
    >
      <DateBadge isoStart={booking.startAtUtc} timezone={salonTz} highlight={booking.isToday} />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={booking.status}
            actionRequiredBy={booking.actionRequiredBy}
            isToday={booking.isToday}
          />
          <span className="font-mono text-xs text-text-sec">
            {formatDuration(booking.durationMin)}
          </span>
        </div>

        <div className="font-semibold text-text-main">{booking.service.name}</div>

        {zoneLabel ? (
          <div className="flex items-center gap-1 text-xs font-medium text-accent-text">
            <Calendar className="h-3 w-3 shrink-0" aria-hidden />
            <span>
              {T.salonTimeNote} {zoneLabel}
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-sm text-text-sec">
          {booking.provider.avatarUrl ? (
            <ResilientImage
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

        {booking.status === "CHANGE_REQUESTED" && booking.proposedStartAt ? (
          <RescheduleProposal
            booking={booking}
            salonTz={salonTz}
            onAnswer={onAnswerReschedule}
            busy={answerBusy}
            error={answerError}
          />
        ) : null}

        <BookingActions
          booking={booking}
          onCancel={onCancel}
          onReschedule={onReschedule}
          onReview={onReview}
          cancelBusy={cancelBusy}
        />
        {cancelError ? (
          <p className="text-xs text-danger-text" role="alert" data-testid="cancel-error">
            {cancelError}
          </p>
        ) : null}
      </div>

      <div className="text-right sm:min-w-[6rem]">
        <div className="font-mono text-lg font-semibold text-text-main">
          {moneyRUBFromKopeks(booking.service.priceSnapshot)}
        </div>
      </div>
    </Card>
  );
}

function DateBadge({
  isoStart,
  timezone,
  highlight,
}: {
  isoStart: string | null;
  timezone: string;
  highlight: boolean;
}) {
  if (!isoStart) {
    return (
      <div className="w-16 shrink-0 rounded-2xl bg-bg-input p-3 text-center text-xs text-text-sec">
        —
      </div>
    );
  }
  // QA-107/FIX-22: render in the SALON's timezone (not the viewer's host tz).
  const d = new Date(isoStart);
  const month = d
    .toLocaleString("ru-RU", { month: "short", timeZone: timezone })
    .toUpperCase()
    .replace(".", "");
  const day = d.toLocaleString("ru-RU", { day: "numeric", timeZone: timezone });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
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

/**
 * RESCHEDULE-CLIENT-APPROVAL — блок предложения переноса (инв. #32, сторона
 * клиента). Мастер предложил (`actionRequiredBy === "CLIENT"`) → текст +
 * «Подтвердить перенос» / «Оставить прежнее время»; клиент сам попросил →
 * только текст «ждём ответа мастера». Время предложения — в salon-tz, как и
 * всё на карточке (rule 17).
 */
function RescheduleProposal({
  booking,
  salonTz,
  onAnswer,
  busy,
  error,
}: {
  booking: ClientBookingDTO;
  salonTz: string;
  onAnswer: (answer: "accept" | "decline") => void;
  busy: boolean;
  error: string | null;
}) {
  if (!booking.proposedStartAt) return null;
  const when = UI_FMT.dateTimeLong(booking.proposedStartAt, { timeZone: salonTz });
  const awaitsClient = booking.actionRequiredBy === "CLIENT";
  const text = (awaitsClient ? T.rescheduleProposedByMaster : T.rescheduleProposedByYou).replace(
    "{when}",
    when,
  );

  return (
    <div
      data-testid="reschedule-proposal"
      className="rounded-xl border border-warning-border bg-warning-surface px-3 py-2.5"
    >
      <p className="text-sm font-medium text-warning-text">{text}</p>
      {awaitsClient ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => onAnswer("accept")}
            data-testid="reschedule-accept"
          >
            {T.actionAcceptReschedule}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAnswer("decline")}
            data-testid="reschedule-keep"
          >
            {T.actionKeepTime}
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}

function StatusBadge({
  status,
  actionRequiredBy,
  isToday,
}: {
  status: ClientBookingDTO["status"];
  actionRequiredBy: ClientBookingDTO["actionRequiredBy"];
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
      // RESCHEDULE-CLIENT-APPROVAL: чей ход — видно по бейджу.
      return (
        <Badge variant="warning">
          {actionRequiredBy === "CLIENT" ? STATUS_T.needsYourAnswer : STATUS_T.changeRequested}
        </Badge>
      );
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
  cancelBusy,
}: {
  booking: ClientBookingDTO;
  onCancel: () => void;
  onReschedule: () => void;
  onReview: () => void;
  cancelBusy: boolean;
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
    // FIX-07 (QA-120): action chips are ≥44px (min-h-[44px]) + gap-2 so the
    // destructive "Отменить" isn't mis-tapped next to the others when the row
    // wraps on mobile.
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {booking.isUpcoming ? (
        <>
          {chatHref ? (
            <ActionLink href={chatHref} icon={MessageSquare} label={T.actionChat} variant="primary" />
          ) : null}
          {/* RESCHEDULE-CLIENT-APPROVAL: пока перенос согласуется, второй запрос
              сервер отклоняет (409) — кнопку не показываем, ответ даётся в
              блоке предложения выше. */}
          {booking.status === "CHANGE_REQUESTED" ? null : (
            <ActionButton icon={Calendar} label={T.actionReschedule} onClick={onReschedule} />
          )}
          {/* FIX-B18: без `download` — атрибут заставил бы браузер СКАЧАТЬ цель
              редиректа при отказе (страницу вместо файла). На успехе он не
              нужен: ответ несёт `Content-Disposition: attachment`, который сам
              вызывает скачивание, не уводя пользователя со страницы. */}
          <ActionLink
            href={`/api/bookings/${booking.id}/ics`}
            icon={Download}
            label={T.actionIcs}
          />
          {mapsHref ? (
            <ActionLink href={mapsHref} icon={MapPin} label={T.actionRoute} target="_blank" />
          ) : null}
          {/* CANCEL-DURING-RESCHEDULE: доступна и пока перенос согласуется —
              сервер отменяет запись в любом живом статусе, включая
              CHANGE_REQUESTED. */}
          <ActionButton
            icon={X}
            label={T.actionCancel}
            onClick={onCancel}
            variant="danger"
            disabled={cancelBusy}
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
      return "border-primary/30 bg-primary/10 text-accent-text hover:bg-primary/15";
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
  disabled = false,
}: {
  icon: typeof Calendar;
  label: string;
  onClick: () => void;
  variant?: ActionVariant;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-50 ${actionClass(
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
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-xs font-medium transition ${actionClass(
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
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-xs font-medium transition ${actionClass(
        variant,
      )}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * RES-28: локальная копия называлась `EmptyState` — ровно как общий экспорт из
 * `@/components/ui/empty-state`, из-за чего в трёх файлах `client-cabinet` жили
 * три разных компонента с одним именем. Действие и текст сохранены дословно.
 */
function BookingsEmptyState() {
  return (
    <EmptyState
      variant="card"
      iconSize="lg"
      icon={Calendar}
      title={T.empty}
      action={{ label: T.emptyCta, href: "/catalog", variant: "primary" }}
    />
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

// FIX-20 (Item 2): format the «Ближайшая» tile in the SALON timezone — both the
// time AND the «Сегодня»/«Завтра» relative day are computed in `timeZone`, so the
// tile matches the list row's salon-tz time (one number per booking, QA-107).
function formatRelativeDateTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  // Salon-tz date key (en-CA → YYYY-MM-DD) for relative-day comparison.
  const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone });
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const bookingKey = dayKey(d);

  if (bookingKey === dayKey(now)) return `Сегодня, ${time}`;
  if (bookingKey === dayKey(tomorrow)) return `Завтра, ${time}`;
  return (
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone }) +
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
