"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { usePrompt } from "@/hooks/use-prompt";
import * as UI_TEXT from "@/lib/ui/text";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";

const T = UI_TEXT.cabinetMaster.dashboard;

type Props = {
  bookingId: string;
  /**
   * MASTER-DASHBOARD-FIX-A #3: when the booking's start time has already
   * passed the buttons stay visible (visibility-over-hiding) but are
   * disabled — confirming a started/finished booking is no longer
   * meaningful and the backend would race with `resolveBookingRuntimeStatus`.
   */
  isPastConfirmWindow?: boolean;
};

/**
 * Confirm / Decline action buttons for pending bookings on the dashboard.
 * Tiny client island that PATCHes the API and triggers a server-component
 * refresh on success — keeps the rest of the dashboard server-rendered.
 */
export function BookingActionButtons({ bookingId, isPastConfirmWindow = false }: Props) {
  const router = useRouter();
  const { prompt, modal: promptModal } = usePrompt();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patchStatus(status: "CONFIRMED" | "REJECTED", comment?: string) {
    setBusy(status === "CONFIRMED" ? "confirm" : "decline");
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/master/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(comment ? { comment } : {}) }),
      });
      // Re-render the server tree so counters and the row disappear.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(serverMessageOr(err, status === "CONFIRMED"
            ? T.bookingActions.confirmError
            : T.bookingActions.declineError));
    } finally {
      setBusy(null);
    }
  }

  const handleDecline = async () => {
    const comment = await prompt({
      title: T.bookingActions.declineTitle,
      label: T.bookingActions.declineLabel,
      placeholder: T.bookingActions.declinePlaceholder,
      confirmLabel: T.bookingActions.declineConfirmLabel,
      variant: "danger",
    });
    if (!comment) return;
    void patchStatus("REJECTED", comment);
  };

  const disabled = pending || busy !== null || isPastConfirmWindow;
  const tooltip = isPastConfirmWindow ? T.bookings.confirmWindowExpiredTooltip : undefined;

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            title={tooltip}
            onClick={handleDecline}
          >
            {T.bookings.declineAction}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={disabled}
            title={tooltip}
            onClick={() => void patchStatus("CONFIRMED")}
          >
            {T.bookings.confirmAction}
          </Button>
        </div>
        {error ? <p className="text-[11px] text-danger-text">{error}</p> : null}
      </div>
      {promptModal}
    </>
  );
}
