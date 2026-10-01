"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import {
  SlotPickerOptimized,
  groupSlotsByTimeOfDay,
  type SlotItem as SlotPickerItem,
} from "@/features/booking/components/slot-picker/slot-picker";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { UI_FMT } from "@/lib/ui/fmt";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";

const T = UI_TEXT.cabinetMaster.schedule.reschedule;

type ApiSlot = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
};

type RescheduleContext = {
  masterProviderId: string;
  serviceId: string;
  durationMin: number;
  /**
   * TZ-DISPLAY-SALON-PARITY-01: the booking's provider (salon) tz. All
   * booking/slot times in this modal render in it (not the viewer's browser
   * tz), matching the salon-tz slot generation.
   */
  timezone: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CHANGE_REQUESTED"
    | "REJECTED"
    | "IN_PROGRESS"
    | "FINISHED";
};

type Props = {
  open: boolean;
  bookingId: string;
  /**
   * Original start (ISO UTC) — used purely to render «Текущее время»
   * label so the master sees what they're moving away from.
   */
  startAtUtc: string;
  /**
   * Service duration in minutes — used as a fallback for the modal's
   * label. The fresh value from the reschedule-context endpoint wins
   * when the per-master override differs.
   */
  durationMin: number;
  onClose: () => void;
};

// TZ-DISPLAY-SALON-PARITY-01: build the day-chip range as SALON-local date keys
// (was browser-local `new Date()` + getDate) so the chips + the slots they
// filter agree in the salon's tz.
function buildSalonDateKeys(salonTz: string, days: number): string[] {
  const todayKey = toLocalDateKey(new Date(), salonTz);
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    keys.push(addDaysToDateKey(todayKey, i));
  }
  return keys;
}

// A salon-local date key (already tz-resolved) → its «пн, 8 июл.» label
// (UI_FMT.dateKey: UTC-tech, the key's Y-M-D renders as-is).
function formatDateLabel(dateKey: string): string {
  return UI_FMT.dateKey(dateKey, "weekdayDayMonthShort");
}


/**
 * MASTER-RESCHEDULE-FIX-A — replaces the raw `<input type="date" />` +
 * `<input type="time" />` picker with the free-slots availability flow
 * used everywhere else (client cabinet + booking widget).
 *
 * Flow on open:
 *   1. Fetch `/api/master/bookings/{id}/reschedule-context` for
 *      master+service+duration+runtime-status.
 *   2. If `status === "CHANGE_REQUESTED"` → show the «В ожидании»
 *      guard view (no submit). The trigger sites also hide/disable
 *      the action button (defence-in-depth), but the modal guards
 *      independently in case it ever opens via deep-link or stale
 *      UI state.
 *   3. Else → render the same date-chips + slot-picker layout as the
 *      cabinet/client-reschedule modal, fed by
 *      `/api/masters/{id}/availability?serviceId=…&from=…&limit=1`.
 *
 * Backend still enforces:
 *   - `ensureNoConflictsExcluding` (overlap #11) — last-resort race
 *     protection
 *   - `assertBookingWindow` (BOOKING-WIDGET-A) — provider's
 *     min/maxBookingDays policy applies to the new time
 *   - `ensureBookingActionWindow` (60-min cancel/reschedule rule on
 *     the ORIGINAL time)
 *   - per-actor change-request count cap (3 per side)
 */
export function RescheduleModal({
  open,
  bookingId,
  startAtUtc,
  // `durationMin` from props is intentionally not used — the
  // reschedule-context endpoint returns the authoritative duration
  // (incl. master overrides). Kept in the Props signature for
  // backwards-compat with existing callers (booking-card-actions-menu,
  // booking-row-actions, booking-manage-actions).
  durationMin: _unusedDurationMin,
  onClose,
}: Props) {
  void _unusedDurationMin;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const viewerTimeZone = useViewerTimeZoneContext();

  const [context, setContext] = useState<RescheduleContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  // TZ-DISPLAY-SALON-PARITY-01: salon tz arrives with the reschedule-context
  // fetch; until then the picker + date chips aren't rendered (both gated on
  // `context`), so `salonTz` is always present where booking/slot times show.
  const salonTz = context?.timezone ?? null;
  const dateOptions = useMemo(
    () => (salonTz ? buildSalonDateKeys(salonTz, 14) : []),
    [salonTz],
  );
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [slots, setSlots] = useState<ApiSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotLabel, setSlotLabel] = useState<string>("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setContext(null);
    setContextError(null);
    setSlots([]);
    setSlotLabel("");
    setComment("");
    setError(null);
    setSelectedDate("");
  }, [open, bookingId]);

  // TZ-DISPLAY-SALON-PARITY-01: pick the first day once the SALON-local range is
  // known (i.e. context loaded). Functional update avoids a `selectedDate` dep.
  useEffect(() => {
    if (!open || dateOptions.length === 0) return;
    setSelectedDate((current) =>
      dateOptions.includes(current) ? current : dateOptions[0]!,
    );
  }, [open, dateOptions]);

  // Load booking context (master+service+status) on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContextLoading(true);
    void fetchJsonWithAuth<RescheduleContext>(
      `/api/master/bookings/${encodeURIComponent(bookingId)}/reschedule-context`,
      { cache: "no-store" },
    )
      .then((data) => {
        if (!cancelled) setContext(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setContextError(serverMessageOr(error, T.contextError));
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  // Load slots whenever (context, selectedDate) changes — only when
  // status is not CHANGE_REQUESTED (we don't render the picker in
  // that branch).
  useEffect(() => {
    if (!open || !context || !selectedDate) return;
    if (context.status === "CHANGE_REQUESTED") return;
    let cancelled = false;
    setSlotsLoading(true);
    setError(null);
    const url = new URL(
      `/api/masters/${encodeURIComponent(context.masterProviderId)}/availability`,
      window.location.origin,
    );
    url.searchParams.set("serviceId", context.serviceId);
    url.searchParams.set("from", selectedDate);
    url.searchParams.set("limit", "1");
    // RESCHEDULE-SELF-SLOT: окно самой брони не занято — иначе сдвиг на
    // полчаса внутри своего же окна был невозможен.
    url.searchParams.set("excludeBookingId", bookingId);
    void fetchJsonWithAuth<{ slots: ApiSlot[] }>(url.toString(), { cache: "no-store" })
      .then((data) => {
        if (!cancelled) setSlots(data.slots ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(serverMessageOr(error, T.slotsError));
          setSlots([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, context, selectedDate, bookingId]);

  // Filter and group slots for the picker; exclude the booking's
  // current slot (master shouldn't "move to where it already is").
  const slotItemsForDate = useMemo<SlotPickerItem[]>(() => {
    // TZ-DISPLAY-SALON-PARITY-01: filter the day + render the time in SALON tz
    // (was viewer tz), matching the salon-tz slot generation. `salonTz` is
    // always set here — `slots` only load after the context (with tz) arrives.
    if (!salonTz) return [];
    const originalIso = (() => {
      const d = new Date(startAtUtc);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    })();
    return slots
      .filter((slot) => toLocalDateKey(slot.startAtUtc, salonTz) === selectedDate)
      .filter((slot) => slot.startAtUtc !== originalIso)
      .map((slot) => ({
        id: slot.label,
        label: slot.label,
        timeText: UI_FMT.timeShort(slot.startAtUtc, { timeZone: salonTz }),
      }));
  }, [selectedDate, slots, salonTz, startAtUtc]);

  const slotGroups = useMemo(
    () =>
      groupSlotsByTimeOfDay(slotItemsForDate).filter(
        (group) => group.items.length > 0,
      ),
    [slotItemsForDate],
  );

  const slotByLabel = useMemo(
    () => new Map(slots.map((s) => [s.label, s])),
    [slots],
  );

  if (!open) return null;

  // EXP-019 + TZ-DISPLAY-SALON-PARITY-01: the "current time" label renders in
  // the SALON tz (matching the slot picker below), labeled «(город, GMT+N)» when
  // the viewer differs. Shown once the context (and thus `salonTz`) has loaded;
  // until then a dash (the picker also shows its own loading state).
  const original = new Date(startAtUtc);
  const originalLabel =
    !salonTz || Number.isNaN(original.getTime())
      ? "—"
      : `${UI_FMT.dateShort(startAtUtc, { timeZone: salonTz })} · ${UI_FMT.timeShort(startAtUtc, { timeZone: salonTz })}`;
  const originalZoneLabel =
    salonTz &&
    !Number.isNaN(original.getTime()) &&
    zonesDifferForViewer({ iso: startAtUtc, salonTimeZone: salonTz, viewerTimeZone })
      ? formatZoneLabel({ iso: startAtUtc, timeZone: salonTz })
      : "";

  // ── #5а pending guard ────────────────────────────────────────────
  // When the booking already has a pending change request, the modal
  // refuses to start a new one — the only useful action is to wait
  // for the other side or to cancel the pending request elsewhere.
  if (context && context.status === "CHANGE_REQUESTED") {
    return (
      <ModalSurface
        open={open}
        onClose={onClose}
        title={T.modalTitle}
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-border bg-warning-surface p-4 text-sm text-warning-text">
            <p className="font-medium">{T.pendingTitle}</p>
            <p className="mt-1 text-warning-text">
              {T.pendingBody}
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              {T.cancel}
            </Button>
          </div>
        </div>
      </ModalSurface>
    );
  }

  async function submit() {
    if (!context) return;
    const slot = slotByLabel.get(slotLabel);
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/bookings/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAtUtc: slot.startAtUtc,
          endAtUtc: slot.endAtUtc,
          slotLabel: slot.label,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      onClose();
      startTransition(() => router.refresh());
    } catch (err) {
      // Занятое окошко — своя, более точная строка поверхности; прочее — дословно.
      setError(
        err instanceof ApiClientError && err.code === "SLOT_CONFLICT"
          ? T.conflictError
          : serverMessageOr(err, T.genericError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      title={T.modalTitle}
      className="max-w-md"
    >
      <>
        <div className="space-y-4">
          <div>
            <p className="mb-1 font-mono text-2xs uppercase tracking-[0.18em] text-text-sec">
              {T.currentLabel}
            </p>
            <p className="text-sm text-text-main">
              {originalLabel}
              {originalZoneLabel ? (
                <span className="text-text-sec"> {originalZoneLabel}</span>
              ) : null}
            </p>
            {context ? (
              <p className="mt-0.5 text-xs text-text-sec">
                {T.durationLabel.replace("{N}", String(context.durationMin))}
              </p>
            ) : null}
          </div>

          {contextLoading ? (
            <div className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-sec">
              {T.contextLoading}
            </div>
          ) : contextError ? (
            <div role="alert" className="rounded-xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-text">
              {contextError}
            </div>
          ) : context ? (
            <>
              <div>
                <p className="mb-2 font-mono text-2xs uppercase tracking-[0.18em] text-text-sec">
                  {T.newDateLabel}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dateOptions.map((date) => {
                    const active = date === selectedDate;
                    return (
                      <Chip
                        key={date}
                        type="button"
                        onClick={() => {
                          setSelectedDate(date);
                          setSlotLabel("");
                        }}
                        variant={active ? "active" : "default"}
                        className="whitespace-nowrap"
                      >
                        {formatDateLabel(date)}
                      </Chip>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 font-mono text-2xs uppercase tracking-[0.18em] text-text-sec">
                  {T.newTimeLabel}
                </p>
                {slotsLoading ? (
                  <div className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-sec">
                    {T.slotsLoading}
                  </div>
                ) : slotGroups.length === 0 ? (
                  <div className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-sec">
                    {T.noSlots}
                  </div>
                ) : (
                  <SlotPickerOptimized
                    groups={slotGroups}
                    value={slotLabel}
                    onChange={setSlotLabel}
                  />
                )}
              </div>

              <div>
                <label className="mb-1 block font-mono text-2xs uppercase tracking-[0.18em] text-text-sec">
                  {T.commentLabel}
                </label>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={T.commentPlaceholder}
                />
              </div>
            </>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-danger-text">
            {error}
          </p>
        ) : null}

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
            className="rounded-xl gap-1.5"
            onClick={() => void submit()}
            disabled={
              submitting ||
              contextLoading ||
              slotsLoading ||
              !context ||
              !slotLabel
            }
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </>
    </ModalSurface>
  );
}
