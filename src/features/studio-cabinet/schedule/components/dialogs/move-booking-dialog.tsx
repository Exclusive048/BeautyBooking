"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "../../server/types";
import { salonInputToUtcIso, utcIsoToSalonInput } from "@/lib/schedule/datetime-input";

const T = UI_TEXT.studioCabinet.scheduleV2.moveDialog;
const TV = UI_TEXT.studioCabinet.scheduleV2;
const E = UI_TEXT.studioCabinet.scheduleV2.errors;

type Props = {
  studioId: string;
  bookingId: string;
  currentMasterId: string;
  currentStartAtUtc: string;
  /**
   * STUDIO-RESCHEDULE-VALIDATION-A #1а: the booking's serviceId is
   * used to gate (disabled + tooltip) masters who don't perform this
   * service. Defense-in-depth — backend's
   * `assertMasterPerformsService` still rejects server-side.
   */
  bookingServiceId: string;
  masters: ScheduleMasterColumn[];
  mode: "master" | "time";
  /**
   * TZ-DISPLAY-SALON-PARITY-01: salon (provider) tz. The datetime-local input
   * is populated + read back as SALON-local wall-clock, so a cross-tz admin
   * edits the salon's time (matching the grid), not their browser tz.
   */
  timezone: string;
  open: boolean;
  onClose: () => void;
};

export function MoveBookingDialog({
  studioId,
  bookingId,
  currentMasterId,
  currentStartAtUtc,
  bookingServiceId,
  masters,
  mode,
  timezone,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [masterId, setMasterId] = useState(currentMasterId);
  const [startAt, setStartAt] = useState(
    utcIsoToSalonInput(currentStartAtUtc, timezone),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMasterId(currentMasterId);
    setStartAt(utcIsoToSalonInput(currentStartAtUtc, timezone));
    setError(null);
  }, [open, currentMasterId, currentStartAtUtc, timezone]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio/bookings/${bookingId}/move`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            studioId,
            targetMasterId: mode === "master" ? masterId : currentMasterId,
            // TZ-DISPLAY-SALON-PARITY-01: interpret the entered wall-clock in
            // the SALON tz → UTC (not the browser tz). Fall back to the current
            // instant if the input is somehow empty/malformed — never shift the
            // booked time by accident.
            targetStartAt: salonInputToUtcIso(startAt, timezone) ?? currentStartAtUtc,
            strategy: "KEEP_SERVICE",
            pricing: "KEEP_PRICE",
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.move);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(E.move);
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "master" ? T.titleToMaster : T.titleTime;

  return (
    <ModalSurface open={open} onClose={handleClose} title={title}>
      <div className="space-y-4">
        {mode === "master" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.masterLabel}
            </span>
            {/* STUDIO-RESCHEDULE-VALIDATION-A #1а: gate masters who
                don't perform this service. Per spec visibility-over-
                hiding — render the option but `disabled` so the
                studio admin understands why it's locked. Backend
                still validates with `assertMasterPerformsService`
                in case a stale UI sends a forbidden value. */}
            <Select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              disabled={submitting}
            >
              {masters
                .filter((m) => m.isAvailable)
                .map((m) => {
                  const performsService = m.serviceIds.includes(bookingServiceId);
                  return (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={!performsService}
                    >
                      {performsService
                        ? m.name
                        : `${m.name} · ${T.masterIncompatibleSuffix}`}
                    </option>
                  );
                })}
            </Select>
            {!masters
              .find((m) => m.id === masterId)
              ?.serviceIds.includes(bookingServiceId) ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {T.masterIncompatibleHint}
              </p>
            ) : null}
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.timeLabel}{" "}
            <span className="font-normal text-text-sec">
              · {TV.salonTimeInputHint}
            </span>
          </span>
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            disabled={submitting}
          />
        </label>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? T.submitting : T.confirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
