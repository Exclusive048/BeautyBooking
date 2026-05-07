"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.breaks.modal;
const DAYS = UI_TEXT.cabinetMaster.scheduleSettings.week.days;

const DAY_OPTIONS: Array<{ id: number; label: string }> = [
  { id: 0, label: DAYS.mon },
  { id: 1, label: DAYS.tue },
  { id: 2, label: DAYS.wed },
  { id: 3, label: DAYS.thu },
  { id: 4, label: DAYS.fri },
  { id: 5, label: DAYS.sat },
  { id: 6, label: DAYS.sun },
];

type Props = {
  onClose: () => void;
  /** Returns the new break definition + the days it should apply to. */
  onSubmit: (input: {
    title: string | null;
    startLocal: string;
    endLocal: string;
    daysOfWeek: number[];
  }) => void;
};

/**
 * Add modal for recurring breaks. Multi-select day picker with quick
 * presets (Пн-Пт / Каждый день / Сб-Вс), title (optional), and time range.
 *
 * Edit is intentionally not supported — a recurring break expands into N
 * template-break rows; in-place edit would need diff against the existing
 * pattern. Delete + recreate keeps the surface area tiny without hurting
 * UX (breaks are rarely changed once configured).
 */
export function BreakModal({ onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startLocal, setStartLocal] = useState("13:00");
  const [endLocal, setEndLocal] = useState("14:00");

  const canSubmit =
    days.length > 0 && timeToMinutes(startLocal) < timeToMinutes(endLocal);

  const toggleDay = (id: number) => {
    setDays((prev) =>
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id].sort((left, right) => left - right)
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const trimmed = title.trim();
    onSubmit({
      title: trimmed.length > 0 ? trimmed : null,
      startLocal,
      endLocal,
      daysOfWeek: days,
    });
  };

  return (
    <ModalSurface open onClose={onClose} title={T.title} className="max-w-md">
      <div className="space-y-5">
        <div>
          <Label>{T.nameLabel}</Label>
          <Input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={T.namePlaceholder}
            className="h-11 rounded-xl px-3 text-sm"
            maxLength={60}
          />
        </div>

        <div>
          <Label>{T.daysLabel}</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DAY_OPTIONS.map((day) => {
              const active = days.includes(day.id);
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => toggleDay(day.id)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-white shadow-card"
                      : "border border-border-subtle bg-bg-card text-text-main hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              onClick={() => setDays([0, 1, 2, 3, 4])}
              className="text-primary transition-colors hover:underline"
            >
              {T.quickWeekdays}
            </button>
            <button
              type="button"
              onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
              className="text-primary transition-colors hover:underline"
            >
              {T.quickEveryday}
            </button>
            <button
              type="button"
              onClick={() => setDays([5, 6])}
              className="text-primary transition-colors hover:underline"
            >
              {T.quickWeekend}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{T.startLabel}</Label>
            <Input
              type="time"
              step={300}
              value={startLocal}
              onChange={(event) => setStartLocal(event.target.value)}
              className="h-11 rounded-xl px-3 text-sm"
            />
          </div>
          <div>
            <Label>{T.endLabel}</Label>
            <Input
              type="time"
              step={300}
              value={endLocal}
              onChange={(event) => setEndLocal(event.target.value)}
              className="h-11 rounded-xl px-3 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="md" className="rounded-xl" onClick={onClose}>
            {T.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="rounded-xl"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {T.submit}
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
