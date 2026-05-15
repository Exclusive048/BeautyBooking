"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.moveDialog;
const E = UI_TEXT.studioCabinet.scheduleV2.errors;

type Props = {
  studioId: string;
  bookingId: string;
  currentMasterId: string;
  currentStartAtUtc: string;
  masters: ScheduleMasterColumn[];
  mode: "master" | "time";
  open: boolean;
  onClose: () => void;
};

function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function fromLocalDateTimeInput(value: string): string {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}

export function MoveBookingDialog({
  studioId,
  bookingId,
  currentMasterId,
  currentStartAtUtc,
  masters,
  mode,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [masterId, setMasterId] = useState(currentMasterId);
  const [startAt, setStartAt] = useState(toLocalDateTimeInput(currentStartAtUtc));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMasterId(currentMasterId);
    setStartAt(toLocalDateTimeInput(currentStartAtUtc));
    setError(null);
  }, [open, currentMasterId, currentStartAtUtc]);

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
            targetStartAt: fromLocalDateTimeInput(startAt),
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
            <Select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              disabled={submitting}
            >
              {masters
                .filter((m) => m.isAvailable)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.timeLabel}
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
