"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard;

type Props = {
  bookingId: string;
};

/**
 * Confirm / Decline action buttons for pending bookings on the dashboard.
 * Tiny client island that PATCHes the API and triggers a server-component
 * refresh on success — keeps the rest of the dashboard server-rendered.
 */
export function BookingActionButtons({ bookingId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patchStatus(status: "CONFIRMED" | "REJECTED", comment?: string) {
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
        throw new Error(json && !json.ok ? json.error.message : `API ${res.status}`);
      }
      // Re-render the server tree so counters and the row disappear.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : status === "CONFIRMED"
            ? T.bookingActions.confirmError
            : T.bookingActions.declineError,
      );
    } finally {
      setBusy(null);
    }
  }

  const handleDecline = () => {
    const comment = window.prompt(T.bookingActions.declineReasonPrompt, "")?.trim();
    if (!comment) return;
    void patchStatus("REJECTED", comment);
  };

  const disabled = pending || busy !== null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={handleDecline}
        >
          {T.bookings.declineAction}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={disabled}
          onClick={() => void patchStatus("CONFIRMED")}
        >
          {T.bookings.confirmAction}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
