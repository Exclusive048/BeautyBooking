"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings;

type Props = {
  bookingId: string;
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
export function BookingCardActions({ bookingId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error(json && !json.ok ? json.error.message : `API ${res.status}`);
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

  const handleDecline = () => {
    const comment = window.prompt(T.declineReasonPrompt, "")?.trim();
    if (!comment) return;
    void patch("REJECTED", comment);
  };

  const disabled = busy !== null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={handleDecline}
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
          className="flex-1"
        >
          {T.card.confirm}
        </Button>
      </div>
      {error ? (
        <p className="text-[11px] text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
