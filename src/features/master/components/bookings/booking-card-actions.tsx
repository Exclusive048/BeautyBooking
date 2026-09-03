"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePrompt } from "@/hooks/use-prompt";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { DEFAULT_ERROR_MESSAGE } from "@/lib/http/client";

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
export function BookingCardActions({ bookingId, rawStatus, actionRequiredBy = null }: Props) {
  const router = useRouter();
  const { prompt, modal: promptModal } = usePrompt();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isInitiatorWaitingResponse =
    rawStatus === "CHANGE_REQUESTED" && actionRequiredBy === "CLIENT";

  async function patch(status: "CONFIRMED" | "REJECTED", comment?: string) {
    setBusy(status === "CONFIRMED" ? "confirm" : "decline");
    setError(null);
    try {
      const res = await fetch(`/api/master/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(comment ? { comment } : {}) }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : DEFAULT_ERROR_MESSAGE);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : status === "CONFIRMED"
            ? T.confirmError
            : T.declineError,
      );
    } finally {
      setBusy(null);
    }
  }

  const handleDecline = async () => {
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

  // MASTER-BOOKING-UI-FIX-A #2а: master IS the initiator of a pending
  // change request — render the guard hint instead of the action
  // buttons so the click doesn't hit the backend's «another side» 409.
  if (isInitiatorWaitingResponse) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
        {T.card.awaitingClientResponse}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={handleDecline}
            data-testid="booking-decline"
            className="flex-1"
          >
            {T.card.decline}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={disabled}
            onClick={() => void patch("CONFIRMED")}
            data-testid="booking-confirm"
            className="flex-1"
          >
            {T.card.confirm}
          </Button>
        </div>
        {error ? (
          <p className="text-[11px] text-red-600">{error}</p>
        ) : null}
      </div>
      {promptModal}
    </>
  );
}
