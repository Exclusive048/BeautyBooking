"use client";

import { useState } from "react";
import { Ban, Minus } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { ru } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import type { EditorExceptionInput } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";
import { ModeCard } from "../components/mode-card";
import type { ExceptionGroup } from "../lib/format-helpers";

const T = UI_TEXT.cabinetMaster.scheduleSettings.exceptions;

type Kind = "OFF" | "TIME_RANGE";

type Submitted = Array<Pick<
  EditorExceptionInput,
  "date" | "isWorkday" | "scheduleMode" | "startTime" | "endTime" | "breaks" | "fixedSlotTimes" | "note"
>>;

type Props = {
  onClose: () => void;
  /** When provided, modal pre-fills with the existing group; otherwise add-flow. */
  editing: ExceptionGroup | null;
  /** Returns the full set of per-date rows the group expands into. */
  onSubmit: (rows: Submitted) => void;
};

/**
 * Add/edit modal for exceptions. Supports two kinds:
 * - OFF: range mode in DayPicker → emits N rows (one per date)
 * - TIME_RANGE: single date + time range → emits 1 row
 *
 * The form re-derives initial state from the `editing` prop on open so
 * cycling through edits doesn't carry stale state. On submit it returns a
 * fully-expanded array of `EditorExceptionInput`-shaped rows; the parent
 * folds them into the full exception list and triggers the auto-save
 * PATCH (`bookingExceptions: [...]`).
 */
export function ExceptionModal({ onClose, editing, onSubmit }: Props) {
  const [kind, setKind] = useState<Kind>(editing?.kind ?? "OFF");
  const [note, setNote] = useState(editing?.note ?? "");
  const [range, setRange] = useState<
    { from: Date | undefined; to?: Date | undefined } | undefined
  >(() => {
    if (!editing || editing.kind !== "OFF") return undefined;
    return {
      from: isoToDate(editing.startDate) ?? undefined,
      to: isoToDate(editing.endDate) ?? undefined,
    };
  });
  const [singleDate, setSingleDate] = useState<Date | undefined>(() =>
    editing && editing.kind === "TIME_RANGE"
      ? isoToDate(editing.startDate) ?? undefined
      : undefined
  );
  const [startTime, setStartTime] = useState(editing?.startLocal ?? "10:00");
  const [endTime, setEndTime] = useState(editing?.endLocal ?? "14:00");

  const canSubmit =
    kind === "OFF"
      ? Boolean(range?.from)
      : Boolean(singleDate) && timeToMinutes(startTime) < timeToMinutes(endTime);

  const handleSubmit = () => {
    if (!canSubmit) return;

    const trimmedNote = note.trim();
    const noteValue = trimmedNote.length > 0 ? trimmedNote : null;

    if (kind === "OFF") {
      const from = range?.from;
      if (!from) return;
      const to = range.to ?? from;
      const rows: Submitted = enumerateDates(from, to).map((date) => ({
        date,
        isWorkday: false,
        scheduleMode: "FLEXIBLE",
        startTime: null,
        endTime: null,
        breaks: [],
        fixedSlotTimes: [],
        note: noteValue,
      }));
      onSubmit(rows);
    } else {
      if (!singleDate) return;
      onSubmit([
        {
          date: dateToIso(singleDate),
          isWorkday: true,
          scheduleMode: "FLEXIBLE",
          startTime,
          endTime,
          breaks: [],
          fixedSlotTimes: [],
          note: noteValue,
        },
      ]);
    }
  };

  return (
    <ModalSurface
      open
      onClose={onClose}
      title={editing ? T.modal.editTitle : T.modal.addTitle}
      className="max-w-xl"
    >
      <div className="space-y-5">
        <div>
          <Label>{T.modal.typeLabel}</Label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ModeCard
              active={kind === "OFF"}
              icon={Ban}
              title={T.modal.offLabel}
              description={T.modal.offDescription}
              onClick={() => setKind("OFF")}
            />
            <ModeCard
              active={kind === "TIME_RANGE"}
              icon={Minus}
              title={T.modal.shortLabel}
              description={T.modal.shortDescription}
              onClick={() => setKind("TIME_RANGE")}
            />
          </div>
        </div>

        <div>
          <Label>{T.modal.noteLabel}</Label>
          <Input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              kind === "OFF" ? T.modal.notePlaceholderOff : T.modal.notePlaceholderShort
            }
            className="h-11 rounded-xl px-3 text-sm"
            maxLength={120}
          />
        </div>

        <div>
          <Label>{kind === "OFF" ? T.modal.rangeLabel : T.modal.dateLabel}</Label>
          <div className="mt-2 inline-block rounded-2xl border border-border-subtle bg-bg-card p-3">
            <div className="rdp-theme">
              {kind === "OFF" ? (
                <DayPicker
                  mode="range"
                  locale={ru}
                  weekStartsOn={1}
                  selected={range}
                  onSelect={(value) => setRange(value)}
                  showOutsideDays={false}
                />
              ) : (
                <DayPicker
                  mode="single"
                  locale={ru}
                  weekStartsOn={1}
                  selected={singleDate}
                  onSelect={(value) => setSingleDate(value ?? undefined)}
                  showOutsideDays={false}
                />
              )}
            </div>
          </div>
        </div>

        {kind === "TIME_RANGE" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T.modal.startLabel}</Label>
              <Input
                type="time"
                step={300}
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="h-11 rounded-xl px-3 text-sm"
              />
            </div>
            <div>
              <Label>{T.modal.endLabel}</Label>
              <Input
                type="time"
                step={300}
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="h-11 rounded-xl px-3 text-sm"
              />
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="md" className="rounded-xl" onClick={onClose}>
            {T.modal.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="rounded-xl"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {editing ? T.modal.submitSave : T.modal.submitAdd}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium uppercase tracking-wide text-text-sec">{children}</label>;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

function isoToDate(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function enumerateDates(from: Date, to: Date): string[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  if (end < start) return [dateToIso(start)];
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(dateToIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
