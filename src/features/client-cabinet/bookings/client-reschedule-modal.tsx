"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";
import type { ClientBookingDTO } from "@/lib/client-cabinet/bookings.service";

const T = UI_TEXT.clientCabinet.booking;

type SlotsApiResponse = {
  timezone: string;
  slots: Array<{
    startAtUtc: string;
    endAtUtc: string;
    label?: string;
  }>;
};

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(async (res) => {
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "load_failed");
    return json.data as SlotsApiResponse;
  });

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function nextDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

type Props = {
  booking: ClientBookingDTO;
  onClose: () => void;
  onSuccess: () => void;
};

export function ClientRescheduleModal({ booking, onClose, onSuccess }: Props) {
  const [date, setDate] = useState<string>(() => todayDateKey());
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotsUrl = date
    ? `/api/public/providers/${booking.provider.id}/slots?serviceId=${
        booking.service.id
      }&from=${date}&to=${nextDateKey(date)}`
    : null;

  const { data: slotsData, isLoading: slotsLoading } = useSWR<SlotsApiResponse>(
    slotsUrl,
    fetcher,
  );

  const slots = useMemo(() => slotsData?.slots ?? [], [slotsData]);

  async function handleSubmit() {
    if (!slotIso) return;
    const slot = slots.find((s) => s.startAtUtc === slotIso);
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const time = new Date(slot.startAtUtc).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAtUtc: slot.startAtUtc,
          endAtUtc: slot.endAtUtc,
          slotLabel: time,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? T.submitFailed);
        return;
      }
      onSuccess();
    } catch {
      setError(T.submitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open onClose={onClose} title={T.moveBooking}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{T.moveBookingHint}</p>

        <div className="rounded-xl bg-bg-input/50 p-3 text-sm">
          <div className="font-semibold text-text-main">
            {booking.service.name}
          </div>
          <div className="mt-0.5 text-text-sec">{booking.provider.name}</div>
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.chooseDate}
          </label>
          <Input
            type="date"
            value={date}
            min={todayDateKey()}
            onChange={(e) => {
              setDate(e.target.value);
              setSlotIso(null);
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.chooseTime}
          </label>
          {slotsLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-bg-input/60" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-xl border border-border-subtle/60 bg-bg-input/40 p-4 text-center text-sm text-text-sec">
              {T.noSlots}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => {
                const active = slot.startAtUtc === slotIso;
                const time = new Date(slot.startAtUtc).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <button
                    key={slot.startAtUtc}
                    type="button"
                    onClick={() => setSlotIso(slot.startAtUtc)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-border-subtle bg-bg-input text-text-main hover:border-primary/40 hover:bg-bg-card"
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-300/50 bg-rose-50/60 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {UI_TEXT.common.cancel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!slotIso || submitting}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {submitting ? T.moving : T.moveConfirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
