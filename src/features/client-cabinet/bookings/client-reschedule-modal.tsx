"use client";

import { useId, useMemo, useState } from "react";
import useSWR from "swr";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Notice } from "@/components/ui/notice";
import { FieldLabel } from "@/components/ui/field-label";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";

/**
 * Что модалке нужно знать о записи. `ClientBookingDTO` подходит структурно;
 * GUEST-MANAGE-LINK передаёт то же из страницы управления по ссылке.
 */
export type RescheduleTarget = {
  id: string;
  startAtUtc: string | null;
  service: { id: string; name: string };
  provider: { id: string; name: string; timezone: string };
};

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
  // Модаль работает и у гостя по ссылке «Управлять записью» — без ухода на вход.
  fetchJson<SlotsApiResponse>(url, { credentials: "include" });

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type Props = {
  booking: RescheduleTarget;
  /**
   * GUEST-MANAGE-LINK: гость без сессии — право доказывает подписанная ссылка.
   * Окошки берутся с `?manageToken=`, перенос уходит в
   * `/api/public/bookings/manage/{token}/reschedule`.
   */
  manageToken?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function ClientRescheduleModal({ booking, manageToken, onClose, onSuccess }: Props) {
  const [date, setDate] = useState<string>(() => todayDateKey());
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dateInputId = useId();
  const [error, setError] = useState<string | null>(null);

  // FIX-STUDIO-02 (F5): request a SINGLE day. The `/slots` endpoint treats
  // `to` as inclusive (it adds +1 internally to make the range exclusive), so
  // the old `to=nextDateKey(date)` returned slots for BOTH `date` and the next
  // day — and since the chips render only «HH:MM» (no date), every time showed
  // up twice (the «34 кнопки / 17 уникальных» duplication). `to=date` pins the
  // list to the day the user actually picked.
  // RESCHEDULE-SELF-SLOT: `excludeBookingId` — окно этой же брони не считается
  // занятым, иначе перенос на полчаса внутри своего окна невозможен.
  const slotsUrl = date
    ? `/api/public/providers/${booking.provider.id}/slots?serviceId=${
        booking.service.id
      }&from=${date}&to=${date}&excludeBookingId=${encodeURIComponent(booking.id)}${
        manageToken ? `&manageToken=${encodeURIComponent(manageToken)}` : ""
      }`
    : null;

  const {
    data: slotsData,
    isLoading: slotsLoading,
    error: slotsError,
  } = useSWR<SlotsApiResponse>(
    slotsUrl,
    fetcher,
  );

  const slots = useMemo(() => slotsData?.slots ?? [], [slotsData]);
  // FIX-STUDIO-CALENDAR-SALON-TZ: reschedule slot times shown in the salon's
  // tz (matching the client-cabinet bookings list), not the browser's. The
  // slots endpoint returns the provider tz; `booking.provider.timezone` is a
  // stable fallback before the slots load.
  const salonTz = slotsData?.timezone ?? booking.provider.timezone;
  // FIX-STUDIO-02 (F5): the slot chips are already salon-tz (correct), but the
  // dialog carried NO «(город, GMT+N)» label — a Moscow client reading a
  // Yekaterinburg studio's «15:00» couldn't tell whose clock it was. Show the
  // same salon-tz note the «Мои записи» list carries, only when the viewer's
  // zone actually differs. Anchor the offset on the booking's own instant.
  const viewerTz = useViewerTimeZoneContext();
  const showZone =
    !!booking.startAtUtc &&
    zonesDifferForViewer({
      iso: booking.startAtUtc,
      salonTimeZone: salonTz,
      viewerTimeZone: viewerTz,
    });
  const zoneLabel = showZone
    ? formatZoneLabel({ iso: booking.startAtUtc, timeZone: salonTz })
    : "";

  async function handleSubmit() {
    if (!slotIso) return;
    const slot = slots.find((s) => s.startAtUtc === slotIso);
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const time = formatLocalHm(new Date(slot.startAtUtc), salonTz);
      const url = manageToken
        ? `/api/public/bookings/manage/${encodeURIComponent(manageToken)}/reschedule`
        : `/api/bookings/${booking.id}/reschedule`;
      await fetchJson<unknown>(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAtUtc: slot.startAtUtc,
          endAtUtc: slot.endAtUtc,
          slotLabel: time,
          ...(manageToken ? { bookingId: booking.id } : {}),
        }),
      });
      onSuccess();
    } catch (error) {
      // Лимит переносов, срок, занятое окошко — отказы сервера дословно.
      setError(serverMessageOr(error, T.submitFailed));
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

        <div>
          <FieldLabel htmlFor={dateInputId} tone="eyebrow">
            {T.chooseDate}
          </FieldLabel>
          <Input
            id={dateInputId}
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
          <FieldLabel tone="eyebrow">
            {T.chooseTime}
          </FieldLabel>
          {zoneLabel ? (
            <div className="flex items-center gap-1 text-xs font-medium text-accent-text">
              <CalendarIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span>
                {UI_TEXT.clientCabinet.bookingsPage.salonTimeNote} {zoneLabel}
              </span>
            </div>
          ) : null}
          {slotsLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-bg-input/60" />
              ))}
            </div>
          ) : slotsError ? (
            // Раньше сбой загрузки выглядел как «Свободных окошек нет».
            <div
              role="alert"
              className="rounded-xl border border-danger-border bg-danger-surface p-4 text-center text-sm text-danger-text"
            >
              {slotsError instanceof Error && slotsError.message ? slotsError.message : T.loadSlotsFailed}
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-xl border border-border-subtle/60 bg-bg-input/40 p-4 text-center text-sm text-text-sec">
              {T.noSlots}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => {
                const active = slot.startAtUtc === slotIso;
                const time = formatLocalHm(new Date(slot.startAtUtc), salonTz);
                return (
                  <Button
                    key={slot.startAtUtc}
                    variant="wrapper"
                    onClick={() => setSlotIso(slot.startAtUtc)}
                    aria-pressed={active}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-border-subtle bg-bg-input text-text-main hover:border-primary/40 hover:bg-bg-card"
                    }`}
                  >
                    {time}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {error ? (
          <Notice tone="danger">{error}</Notice>
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
            data-testid="reschedule-submit"
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {submitting ? T.moving : T.moveConfirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
