"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, Clock, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import { formatZoneLabel } from "@/lib/ui/zone-label";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleBookingCell, ScheduleMasterColumn } from "../../server/types";
import {
  bookingDecisionUrl,
  isPendingClientReschedule,
} from "../../lib/reschedule-decision";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import { MoveBookingDialog } from "./move-booking-dialog";

const T = UI_TEXT.studioCabinet.scheduleV2;

type Props = {
  studioId: string;
  booking: ScheduleBookingCell | null;
  masters: ScheduleMasterColumn[];
  /** FIX-STUDIO-CALENDAR-SALON-TZ: salon tz for the booking-time range. */
  timezone: string;
  onClose: () => void;
};

function formatRange(startIso: string, endIso: string, timeZone: string): string {
  return `${formatLocalHm(new Date(startIso), timeZone)} — ${formatLocalHm(
    new Date(endIso),
    timeZone,
  )}`;
}

export function BookingActionMenu({
  studioId,
  booking,
  masters,
  timezone,
  onClose,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [moveMode, setMoveMode] = useState<"master" | "time" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  // BOOKING-STUDIO-RESCHEDULE-PARITY-01: two-sided approval of a client-proposed
  // reschedule. Mirrors studio notification-actions.tsx (`/confirm` +
  // `/decline-reschedule`, POST no body); on success refresh so the mutated
  // booking re-renders (accept/decline then disappears).
  const [rsBusy, setRsBusy] = useState<"accept" | "decline" | null>(null);
  const [rsError, setRsError] = useState<string | null>(null);

  const open = booking !== null;
  // STUDIO-CONFIRM-01: студийные записи рождаются PENDING (автоподтверждение
  // только у соло-мастеров), и до подтверждения клиент не получает напоминаний.
  // Подтвердить мог только назначенный мастер из своего кабинета; `/confirm`
  // администратора студии пускает (как сторону провайдера), не было кнопки.
  // Время здесь не сверяется (чтение часов в рендере — нечистый рендер): на
  // уже начавшуюся запись сервер ответит «Запись уже началась», и это видно.
  const awaitsConfirmation =
    booking !== null && (booking.status === "PENDING" || booking.status === "NEW");

  function handleClose() {
    setMoveMode(null);
    setCancelOpen(false);
    setRsBusy(null);
    setRsError(null);
    onClose();
  }

  async function handleRescheduleDecision(
    bookingId: string,
    decision: "accept" | "decline",
    fallbackError: string = T.errors.bookingReschedule,
  ) {
    if (rsBusy) return;
    setRsBusy(decision);
    setRsError(null);
    try {
      const response = await fetch(bookingDecisionUrl(bookingId, decision), {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setRsError(body?.error?.message ?? fallbackError);
        setRsBusy(null);
        return;
      }
      startTransition(() => router.refresh());
      handleClose();
    } catch {
      setRsError(fallbackError);
      setRsBusy(null);
    }
  }

  return (
    <>
      <ModalSurface
        open={open && !moveMode && !cancelOpen}
        onClose={handleClose}
        title={T.actions.menuTitle}
      >
        {booking ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border-subtle bg-bg-input/40 p-3">
              <div className="flex items-center gap-2 text-xs text-text-sec">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {formatRange(booking.startAtUtc, booking.endAtUtc, timezone)}
              </div>
              <p className="mt-1.5 text-sm font-semibold text-text-main">
                {booking.clientName || "—"}
              </p>
              <p className="text-xs text-text-sec">{booking.serviceTitle}</p>
              {booking.priceKopeks > 0 ? (
                <p className="mt-1 font-mono text-xs text-text-sec">
                  {UI_FMT.priceLabel(booking.priceKopeks)}
                </p>
              ) : null}
            </div>

            {awaitsConfirmation ? (
              <div className="space-y-2 rounded-lg border border-warning-border bg-warning-surface p-3">
                <p className="text-xs font-semibold text-warning-text">
                  {T.actions.awaitingConfirmation}
                </p>
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={rsBusy !== null}
                  onClick={() =>
                    void handleRescheduleDecision(booking.id, "accept", T.actions.confirmError)
                  }
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {T.actions.confirm}
                </Button>
                {rsError ? (
                  <p role="alert" className="text-xs text-danger-text">
                    {rsError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {isPendingClientReschedule(booking) && booking.proposedStartAtUtc ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/40">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  {T.reschedule.title}
                </div>
                {/* FIX-STUDIO-02 (F4): show the FULL proposed datetime (date +
                    time) next to the current one so a cross-day move (e.g.
                    26.07 → 28.07) can't be accepted as if it were same-day.
                    Salon-tz (studio calendar surface) with an explicit
                    «(город, GMT+N)» label — rule 17. */}
                <div className="space-y-0.5 text-sm tabular-nums text-amber-900 dark:text-amber-100">
                  <p>
                    <span className="opacity-70">{T.reschedule.currentLabel}:</span>{" "}
                    {UI_FMT.dateTimeShort(booking.startAtUtc, { timeZone: timezone })}
                  </p>
                  <p className="font-semibold">
                    <span className="font-normal opacity-70">
                      {T.reschedule.proposedLabel}:
                    </span>{" "}
                    {UI_FMT.dateTimeShort(booking.proposedStartAtUtc, { timeZone: timezone })}
                    {booking.proposedEndAtUtc
                      ? ` — ${UI_FMT.timeShort(booking.proposedEndAtUtc, { timeZone: timezone })}`
                      : ""}
                  </p>
                  {formatZoneLabel({ iso: booking.proposedStartAtUtc, timeZone: timezone }) ? (
                    <p className="text-xs opacity-70">
                      {formatZoneLabel({ iso: booking.proposedStartAtUtc, timeZone: timezone })}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="primary"
                    disabled={rsBusy !== null}
                    onClick={() =>
                      void handleRescheduleDecision(booking.id, "accept")
                    }
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {T.reschedule.accept}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={rsBusy !== null}
                    onClick={() =>
                      void handleRescheduleDecision(booking.id, "decline")
                    }
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    {T.reschedule.decline}
                  </Button>
                </div>
                {rsError ? (
                  <p
                    role="alert"
                    className="text-xs text-rose-600 dark:text-rose-400"
                  >
                    {rsError}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="secondary"
                onClick={() => setMoveMode("master")}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                {T.actions.moveToMaster}
              </Button>
              <Button variant="secondary" onClick={() => setMoveMode("time")}>
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {T.actions.moveTime}
              </Button>
              {/* STUDIO-CLEANUP-FIX-A #1г: «Детали записи» Button
                  removed. It was a pure no-op (`onClick={handleClose}`
                  + clientPhone in browser tooltip but no dialog
                  content) — user complained it was «пустышка». The
                  per-booking info card above already shows client,
                  service, time, and price, so the button added zero
                  value. If a richer detail view is needed later,
                  it's a separate feature. */}
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                <X className="h-3.5 w-3.5" aria-hidden />
                {T.actions.cancel}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>

      {booking && moveMode ? (
        <MoveBookingDialog
          studioId={studioId}
          bookingId={booking.id}
          currentMasterId={booking.masterId}
          currentStartAtUtc={booking.startAtUtc}
          bookingServiceId={booking.serviceId}
          masters={masters}
          mode={moveMode}
          timezone={timezone}
          open
          onClose={() => {
            setMoveMode(null);
            onClose();
          }}
        />
      ) : null}

      {booking && cancelOpen ? (
        <CancelBookingDialog
          bookingId={booking.id}
          clientName={booking.clientName}
          serviceTitle={booking.serviceTitle}
          open
          onClose={() => {
            setCancelOpen(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
