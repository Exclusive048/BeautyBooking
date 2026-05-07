"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatHm } from "@/lib/master/schedule-utils";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.reschedule;

type Props = {
  open: boolean;
  bookingId: string;
  /** Original start (ISO UTC) — used to seed date/time inputs. */
  startAtUtc: string;
  /** Service duration in minutes — used to compute new endAtUtc. */
  durationMin: number;
  onClose: () => void;
};

function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: "", time: "" };
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    date: `${y}-${m}-${day}`,
    time: formatHm(d),
  };
}

function combine(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map((p) => Number.parseInt(p, 10));
  const [hh, mm] = time.split(":").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Compact reschedule dialog. Native `<input type="date">` and `<input
 * type="time">` keep the surface a single client island — `react-day-
 * picker` would be richer but the existing styling is good enough here
 * and reduces bundle weight (already ~28KB from /catalog).
 *
 * On submit POSTs to `/api/bookings/[id]/reschedule` with computed UTC
 * start + end (start + durationMin). Server returns 409 on conflict —
 * we surface the friendly message rather than the raw API string.
 */
export function RescheduleModal({
  open,
  bookingId,
  startAtUtc,
  durationMin,
  onClose,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to the booking's original start whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    const parts = isoToLocalParts(startAtUtc);
    setDate(parts.date);
    setTime(parts.time);
    setComment("");
    setError(null);
  }, [open, startAtUtc]);

  // Body scroll lock + ESC close — same shape as other modals in the app.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const original = new Date(startAtUtc);
  const originalLabel = Number.isNaN(original.getTime())
    ? "—"
    : `${original.getDate()}.${pad(original.getMonth() + 1)} · ${formatHm(original)}`;

  async function submit() {
    const start = combine(date, time);
    if (!start) return;
    const end = new Date(start.getTime() + durationMin * 60_000);
    const slotLabel = `${pad(start.getDate())}.${pad(
      start.getMonth() + 1,
    )} ${formatHm(start)}-${formatHm(end)}`;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAtUtc: start.toISOString(),
          endAtUtc: end.toISOString(),
          slotLabel,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        const status = res.status;
        if (status === 409) {
          throw new Error(T.conflictError);
        }
        throw new Error(
          (json && !json.ok && json.error.message) || T.genericError,
        );
      }
      onClose();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : T.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={T.modalTitle}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-card p-6 shadow-hover"
      >
        <h3 className="font-display text-xl text-text-main">{T.modalTitle}</h3>

        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-text-sec">
              {T.currentLabel}
            </p>
            <p className="text-sm text-text-main">{originalLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase tracking-[0.18em] text-text-sec">
                {T.newDateLabel}
              </label>
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-11 rounded-xl px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase tracking-[0.18em] text-text-sec">
                {T.newTimeLabel}
              </label>
              <Input
                type="time"
                step={900}
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="h-11 rounded-xl px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase tracking-[0.18em] text-text-sec">
              {T.commentLabel}
            </label>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={T.commentPlaceholder}
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="rounded-xl"
            onClick={onClose}
          >
            {T.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="rounded-xl"
            onClick={() => void submit()}
            disabled={submitting || !date || !time}
          >
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}
