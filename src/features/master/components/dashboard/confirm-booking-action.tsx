"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.attention;
const TB = UI_TEXT.cabinetMaster.bookings;

type Props = {
  bookingId: string;
};

/**
 * Inline confirm button for the dashboard's "Требуют внимания" pending
 * task row (fix-02). Replaces the legacy `<Link href="/cabinet/master/bookings/[id]">`
 * which pointed at a non-existent detail route. Calls the same
 * `PATCH /api/master/bookings/[id]/status` endpoint the kanban uses
 * and refreshes the server tree so the task disappears.
 */
export function ConfirmBookingAction({ bookingId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/master/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!response.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API ${response.status}`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : TB.confirmError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={handleConfirm}
        disabled={busy}
      >
        {busy ? T.confirmBookingBusy : T.confirmBookingCta}
      </Button>
      {error ? (
        <p className="text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
