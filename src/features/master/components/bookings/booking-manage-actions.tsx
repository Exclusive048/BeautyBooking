"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMasterBookingCancel } from "@/features/master/components/bookings/use-master-booking-cancel";
import { RescheduleModal } from "@/features/master/components/schedule/reschedule-modal";
import { usePrompt } from "@/hooks/use-prompt";
import { isBookingPastModifyWindow } from "@/lib/bookings/action-state";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings;

type Props = {
  bookingId: string;
  startAtUtc: string;
  durationMin: number;
  /**
   * MASTER-RESCHEDULE-FIX-A: kanban shows confirmed/today cards, but
   * a booking can transition into CHANGE_REQUESTED right after the
   * card was rendered. Pass status so the Reschedule button hides
   * while another change request is awaiting a response (avoids the
   * 409 "already has a pending change request" backend error).
   */
  status?: string;
};

/**
 * Reschedule + Cancel inline actions for bookings in the
 * `confirmed` / `today` kanban columns (fix-02).
 *
 * Reuses the existing `<RescheduleModal>` (originally built for the
 * schedule context menu) and the
 * `PATCH /api/master/bookings/[id]/status` endpoint with `CANCELLED`.
 * On success the server tree refreshes — the card disappears from
 * its current column and shows up in `cancelled`.
 */
export function BookingManageActions({ bookingId, startAtUtc, durationMin, status }: Props) {
  const isAwaitingChangeResponse = status === "CHANGE_REQUESTED";
  // MASTER-DASHBOARD-FIX-A #3: kanban «today» column shows bookings
  // whose start may already be within 60 min — backend rejects both
  // reschedule and cancel with 409 in that window. Disable both
  // buttons preemptively (visibility-over-hiding) with an explanatory
  // tooltip. Uses the same `BOOKING_ACTION_WINDOW_MINUTES = 60` rule
  // as `ensureBookingActionWindow`.
  const isPastModifyWindow = isBookingPastModifyWindow(new Date(startAtUtc));
  const router = useRouter();
  const { prompt, modal: promptModal } = usePrompt();
  const { cancelBooking, modal: packageModal } = useMasterBookingCancel();
  const [busy, setBusy] = useState<"reschedule" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [, startTransition] = useTransition();

  const handleCancel = async () => {
    const comment = await prompt({
      title: T.card.cancelTitle,
      label: T.card.cancelLabel,
      placeholder: T.card.cancelPlaceholder,
      confirmLabel: T.card.cancelConfirmLabel,
      variant: "danger",
    });
    if (!comment) return;
    setBusy("cancel");
    setError(null);
    try {
      // Компонент пакета — с предложением отменить весь пакет.
      const cancelled = await cancelBooking(bookingId, comment);
      if (cancelled) startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : T.card.cancelError);
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <>
      <div className="flex flex-col gap-1">
        {/* KANBAN-ACTIONS-FIT (2026-09-24): колонка канбана фиксированной ширины
            (272 px на телефоне → 220 px под кнопки), а «Перенести» + «Отменить»
            с иконками требуют ~240 px. `flex-1` в ряду без переноса не может
            стать уже своего текста — «Отменить» вылезал за край карточки.
            `flex-wrap` + `flex-auto`: влезают — одной строкой, нет — каждая
            на свою строку во всю ширину. */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || isAwaitingChangeResponse || isPastModifyWindow}
            title={
              isAwaitingChangeResponse
                ? T.card.rescheduleAwaitingTooltip
                : isPastModifyWindow
                  ? UI_TEXT.cabinetMaster.dashboard.bookings.modifyWindowExpiredTooltip
                  : undefined
            }
            onClick={() => setRescheduleOpen(true)}
            className="flex-auto whitespace-nowrap"
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden strokeWidth={1.8} />
            {T.card.reschedule}
          </Button>
          {/* `wrapper`: у `secondary` цвет текста перебивал красный. */}
          <Button
            type="button"
            variant="wrapper"
            size="none"
            disabled={disabled || isPastModifyWindow}
            title={
              isPastModifyWindow
                ? UI_TEXT.cabinetMaster.dashboard.bookings.modifyWindowExpiredTooltip
                : undefined
            }
            onClick={handleCancel}
            className="inline-flex h-9 items-center justify-center rounded-2xl px-3 text-sm font-medium text-danger-text transition-colors hover:bg-danger-surface flex-auto gap-2 whitespace-nowrap border border-danger-border bg-bg-input"
          >
            <X className="h-3.5 w-3.5" aria-hidden strokeWidth={1.8} />
            {T.card.cancel}
          </Button>
        </div>
        {error ? (
          <p className="text-2xs text-danger-text">{error}</p>
        ) : null}
      </div>

      <RescheduleModal
        open={rescheduleOpen}
        bookingId={bookingId}
        startAtUtc={startAtUtc}
        durationMin={durationMin}
        onClose={() => setRescheduleOpen(false)}
      />

      {promptModal}
      {packageModal}
    </>
  );
}
