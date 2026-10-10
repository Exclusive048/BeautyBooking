"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { FieldLabel } from "@/components/ui/field-label";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { salonInputToUtcIso, salonLocalDatetimeInput } from "@/lib/schedule/datetime-input";
import type {
  ScheduleBreakCell,
  ScheduleMasterColumn,
} from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.breakDialog;
const TV = UI_TEXT.studioCabinet.scheduleV2;
const E = UI_TEXT.studioCabinet.scheduleV2.errors;

type Props = {
  studioId: string;
  masters: ScheduleMasterColumn[];
  breaks: ScheduleBreakCell[];
  dayStartIso: string;
  /** FIX-STUDIO-CALENDAR-SALON-TZ: salon tz for the existing-breaks range. */
  timezone: string;
  open: boolean;
  onClose: () => void;
};

export function ManageBreaksDialog({
  studioId,
  masters,
  breaks,
  dayStartIso,
  timezone,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  // FIX-STUDIO-BLOCKERS-01 (F2): memoised — the inline `masters.filter(...)`
  // produced a NEW array identity on every render, and that array sat in the
  // reset-effect's dependency list below. Every state change (each keystroke)
  // re-rendered → the effect re-fired → the whole form snapped back to its
  // defaults, so the API always received «first master, today 13:00–14:00»
  // regardless of what the admin entered (QA-FINDINGS-STUDIO F2).
  const availableMasters = useMemo(() => masters.filter((m) => m.isAvailable), [masters]);
  const defaultMasterId = availableMasters[0]?.id ?? "";
  const [masterId, setMasterId] = useState(defaultMasterId);
  const [startAt, setStartAt] = useState(() => salonLocalDatetimeInput(dayStartIso, 13, timezone));
  const [endAt, setEndAt] = useState(() => salonLocalDatetimeInput(dayStartIso, 14, timezone));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, startDelete] = useTransition();

  // Reset ONLY when it should: the dialog opens, the day changes, the tz
  // changes, or the default master genuinely changes — all STABLE primitives,
  // so unrelated re-renders (typing in a field) no longer wipe the form.
  useEffect(() => {
    if (!open) return;
    setMasterId(defaultMasterId);
    setStartAt(salonLocalDatetimeInput(dayStartIso, 13, timezone));
    setEndAt(salonLocalDatetimeInput(dayStartIso, 14, timezone));
    setNote("");
    setError(null);
  }, [open, dayStartIso, defaultMasterId, timezone]);

  function handleClose() {
    if (submitting || deleting) return;
    onClose();
  }

  async function handleAdd() {
    if (!masterId) {
      setError(E.breakMasterRequired);
      return;
    }
    // TZ-DISPLAY-MANAGE-BREAKS-INPUT: interpret the entered wall-clock in the
    // SALON tz → UTC (never the browser tz). Empty/malformed → reject, never
    // silently shift to "now" (the old `fromLocalDateTime` fallback).
    const startIso = salonInputToUtcIso(startAt, timezone);
    const endIso = salonInputToUtcIso(endAt, timezone);
    if (!startIso || !endIso) {
      setError(E.breakTimeRange);
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setError(E.breakTimeRange);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>("/api/studio/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          masterId,
          startAt: startIso,
          endAt: endIso,
          type: "BREAK",
          note: note.trim() || undefined,
        }),
      });
      setNote("");
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.breakCreate));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(blockId: string) {
    startDelete(async () => {
      try {
        await fetchJsonWithAuth<unknown>(
          `/api/studio/blocks/${blockId}?studioId=${encodeURIComponent(studioId)}`,
          { method: "DELETE" },
        );
        router.refresh();
      } catch (error) {
        setError(serverMessageOr(error, E.breakDelete));
      }
    });
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{T.subtitle}</p>

        {/* Existing breaks list */}
        <section className="space-y-2">
          <p className="eyebrow">
            {T.existingTitle}
          </p>
          {breaks.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-subtle bg-bg-input/30 px-3 py-2 text-xs text-text-sec">
              <Coffee className="h-3.5 w-3.5" aria-hidden />
              {T.empty}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {breaks.map((entry) => {
                const master = masters.find((m) => m.id === entry.masterId);
                // FIX-STUDIO-CALENDAR-SALON-TZ: existing breaks are shown in the
                // salon's tz (matching the calendar grid). The add-break
                // datetime-local inputs below now ALSO edit in salon-tz via the
                // shared datetime-input helpers (TZ-DISPLAY-MANAGE-BREAKS-INPUT).
                const range = `${formatLocalHm(
                  new Date(entry.startAtUtc),
                  timezone,
                )} — ${formatLocalHm(new Date(entry.endAtUtc), timezone)}`;
                return (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-main">
                        {master?.name ?? "—"} · {range}
                      </p>
                      {entry.note ? (
                        <p className="truncate text-2xs text-text-sec">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>
                    <Button variant="wrapper"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deleting}
                      className="inline-grid h-7 w-7 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-card hover:text-danger-text"
                      aria-label={T.removeButton}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Add break form */}
        <section className="space-y-3 border-t border-border-subtle pt-4">
          <p className="eyebrow">
            {T.addTitle}
          </p>

          <label className="block">
            <FieldLabel>
              {T.masterLabel}
            </FieldLabel>
            <Select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              disabled={submitting || availableMasters.length === 0}
            >
              {availableMasters.length === 0 ? (
                <option value="">{T.noMasters}</option>
              ) : null}
              {availableMasters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <FieldLabel>
                {T.startLabel}{" "}
                <span className="font-normal text-text-sec">· {TV.salonTimeInputHint}</span>
              </FieldLabel>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="block">
              <FieldLabel>
                {T.endLabel}{" "}
                <span className="font-normal text-text-sec">· {TV.salonTimeInputHint}</span>
              </FieldLabel>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          <label className="block">
            <FieldLabel>
              {T.noteLabel}
            </FieldLabel>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={T.notePlaceholder}
              disabled={submitting}
              maxLength={500}
            />
          </label>
        </section>

        {error ? (
          <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting || deleting}>
            {T.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={handleAdd}
            disabled={submitting || availableMasters.length === 0}
          >
            {submitting ? T.submitting : T.addButton}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
