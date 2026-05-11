"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RescheduleModal } from "@/features/master/components/schedule/reschedule-modal";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings;

type Props = {
  bookingId: string;
  startAtUtc: string;
  durationMin: number;
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
export function BookingManageActions({ bookingId, startAtUtc, durationMin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reschedule" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [, startTransition] = useTransition();

  const handleCancel = async () => {
    const comment = window.prompt(T.card.cancelPrompt, "")?.trim();
    if (!comment) return;
    setBusy("cancel");
    setError(null);
    try {
      const res = await fetch(`/api/master/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", comment }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API ${res.status}`);
      }
      startTransition(() => router.refresh());
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
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => setRescheduleOpen(true)}
            className="flex-1 gap-1"
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden strokeWidth={1.8} />
            {T.card.reschedule}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={handleCancel}
            className="flex-1 gap-1 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
          >
            <X className="h-3.5 w-3.5" aria-hidden strokeWidth={1.8} />
            {T.card.cancel}
          </Button>
        </div>
        {error ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
        ) : null}
      </div>

      <RescheduleModal
        open={rescheduleOpen}
        bookingId={bookingId}
        startAtUtc={startAtUtc}
        durationMin={durationMin}
        onClose={() => setRescheduleOpen(false)}
      />
    </>
  );
}
