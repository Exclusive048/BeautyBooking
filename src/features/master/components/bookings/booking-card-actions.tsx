"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePrompt } from "@/hooks/use-prompt";
import { useConfirm } from "@/hooks/use-confirm";
import { isBookingPastModifyWindow } from "@/lib/bookings/action-state";
import * as UI_TEXT from "@/lib/ui/text";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";

const T = UI_TEXT.cabinetMaster.bookings;

type Props = {
  bookingId: string;
  /**
   * MASTER-BOOKING-UI-FIX-A: the kanban "pending" column groups both
   * PENDING and CHANGE_REQUESTED bookings. For CHANGE_REQUESTED ones
   * where the master is the initiator (actionRequiredBy === "CLIENT"),
   * confirm/decline must NOT render — backend rejects with «Action is
   * required from another side» 409. Defaults preserve the old
   * behaviour for PENDING bookings.
   */
  rawStatus?: string;
  actionRequiredBy?: "CLIENT" | "MASTER" | null;
  /**
   * BOOKING-FLOW-AUDIT-RESIDUALS: отказ по записи сервер принимает не позже
   * чем за 60 минут до начала (`ensureBookingActionWindow`) — кнопка
   * выключается заранее, как «Отменить» в соседней колонке.
   */
  startAtUtc?: string | null;
};

/**
 * Client island for pending kanban cards. Calls the existing
 * `PATCH /api/master/bookings/[id]/status` endpoint with `CONFIRMED` /
 * `REJECTED` and triggers a server-tree refresh on success so the card
 * disappears from the pending column and shows up in confirmed/cancelled.
 *
 * Decline always prompts for a reason — the API rejects empty comments
 * for non-CHANGE_REQUESTED rejections, and the customer message reads
 * better with one anyway.
 */
export function BookingCardActions({
  bookingId,
  rawStatus,
  actionRequiredBy = null,
  startAtUtc = null,
}: Props) {
  const router = useRouter();
  const { prompt, modal: promptModal } = usePrompt();
  const { confirm, modal: confirmModal } = useConfirm();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isInitiatorWaitingResponse =
    rawStatus === "CHANGE_REQUESTED" && actionRequiredBy === "CLIENT";
  // RESCHEDULE-DECLINE-NOTIFY-01: клиент попросил перенос, ответ за мастером.
  // «Отклонить» здесь отклоняет ПЕРЕНОС (сервер оставляет запись на прежнем
  // времени и причину не читает), поэтому ни «Отклонить запись», ни поля
  // причины отказа — только подтверждение «оставить прежнее время».
  const answersClientReschedule =
    rawStatus === "CHANGE_REQUESTED" && actionRequiredBy === "MASTER";

  async function patch(status: "CONFIRMED" | "REJECTED", comment?: string) {
    setBusy(status === "CONFIRMED" ? "confirm" : "decline");
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/master/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(comment ? { comment } : {}) }),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      // Раньше любой отказ без тела печатал общий дефолт вместо строки
      // поверхности — `serverMessageOr` различает (29.09 · 11).
      setError(serverMessageOr(err, status === "CONFIRMED" ? T.confirmError : T.declineError));
    } finally {
      setBusy(null);
    }
  }

  const handleDecline = async () => {
    if (answersClientReschedule) {
      const ok = await confirm({
        title: T.card.keepOriginalTitle,
        message: T.card.keepOriginalMessage,
        confirmLabel: T.card.keepOriginalTime,
      });
      if (ok) void patch("REJECTED");
      return;
    }
    const comment = await prompt({
      title: T.card.declineTitle,
      label: T.card.declineLabel,
      placeholder: T.card.declinePlaceholder,
      confirmLabel: T.card.declineConfirmLabel,
      variant: "danger",
    });
    if (!comment) return;
    void patch("REJECTED", comment);
  };

  const disabled = busy !== null;
  // Отказ от ПЕРЕНОСА окна не знает (запись остаётся на прежнем времени) —
  // гейтится только отказ по самой записи.
  const declineLocked =
    !answersClientReschedule && isBookingPastModifyWindow(startAtUtc ? new Date(startAtUtc) : null);

  // MASTER-BOOKING-UI-FIX-A #2а: master IS the initiator of a pending
  // change request — render the guard hint instead of the action
  // buttons so the click doesn't hit the backend's «another side» 409.
  if (isInitiatorWaitingResponse) {
    return (
      <div className="rounded-lg border border-warning-border bg-warning-surface px-2.5 py-1.5 text-2xs text-warning-text">
        {T.card.awaitingClientResponse}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {/* KANBAN-ACTIONS-FIT: «Оставить прежнее время» + «Принять перенос» в
            карточку 220 px одной строкой не помещаются — ряд переносится
            (см. booking-manage-actions.tsx). */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || declineLocked}
            title={declineLocked ? UI_TEXT.cabinetMaster.dashboard.bookings.modifyWindowExpiredTooltip : undefined}
            onClick={handleDecline}
            data-testid="booking-decline"
            className="flex-auto whitespace-nowrap"
          >
            {answersClientReschedule ? T.card.keepOriginalTime : T.card.decline}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={disabled}
            onClick={() => void patch("CONFIRMED")}
            data-testid="booking-confirm"
            className="flex-auto whitespace-nowrap"
          >
            {answersClientReschedule ? T.card.acceptReschedule : T.card.confirm}
          </Button>
        </div>
        {error ? (
          <p className="text-2xs text-danger-text">{error}</p>
        ) : null}
      </div>
      {promptModal}
      {confirmModal}
    </>
  );
}
