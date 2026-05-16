"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  ScheduleBreakCell,
  ScheduleMasterColumn,
} from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.breakDialog;
const E = UI_TEXT.studioCabinet.scheduleV2.errors;

type Props = {
  studioId: string;
  masters: ScheduleMasterColumn[];
  breaks: ScheduleBreakCell[];
  dayStartIso: string;
  open: boolean;
  onClose: () => void;
};

function toLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fromLocalDateTime(value: string): string {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}

function defaultStartFor(dayStartIso: string): string {
  // 13:00 local time on the viewed day — a reasonable lunch default.
  const dayStart = new Date(dayStartIso);
  const lunch = new Date(dayStart);
  lunch.setHours(13, 0, 0, 0);
  return toLocalDateTime(lunch.toISOString());
}

function defaultEndFor(dayStartIso: string): string {
  const dayStart = new Date(dayStartIso);
  const lunch = new Date(dayStart);
  lunch.setHours(14, 0, 0, 0);
  return toLocalDateTime(lunch.toISOString());
}

export function ManageBreaksDialog({
  studioId,
  masters,
  breaks,
  dayStartIso,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const availableMasters = masters.filter((m) => m.isAvailable);
  const [masterId, setMasterId] = useState(availableMasters[0]?.id ?? "");
  const [startAt, setStartAt] = useState(defaultStartFor(dayStartIso));
  const [endAt, setEndAt] = useState(defaultEndFor(dayStartIso));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (!open) return;
    setMasterId(availableMasters[0]?.id ?? "");
    setStartAt(defaultStartFor(dayStartIso));
    setEndAt(defaultEndFor(dayStartIso));
    setNote("");
    setError(null);
  }, [open, dayStartIso, availableMasters]);

  function handleClose() {
    if (submitting || deleting) return;
    onClose();
  }

  async function handleAdd() {
    if (!masterId) {
      setError(E.breakMasterRequired);
      return;
    }
    const startIso = fromLocalDateTime(startAt);
    const endIso = fromLocalDateTime(endAt);
    if (new Date(endIso) <= new Date(startIso)) {
      setError(E.breakTimeRange);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/blocks", {
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
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.breakCreate);
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setError(E.breakCreate);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(blockId: string) {
    startDelete(async () => {
      try {
        const response = await fetch(
          `/api/studio/blocks/${blockId}?studioId=${encodeURIComponent(studioId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          setError(E.breakDelete);
          return;
        }
        router.refresh();
      } catch {
        setError(E.breakDelete);
      }
    });
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{T.subtitle}</p>

        {/* Existing breaks list */}
        <section className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
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
                const startDate = new Date(entry.startAtUtc);
                const endDate = new Date(entry.endAtUtc);
                const range = `${startDate.toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })} — ${endDate.toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`;
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
                        <p className="truncate text-[11px] text-text-sec">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deleting}
                      className="inline-grid h-7 w-7 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-card hover:text-red-600"
                      aria-label={T.removeButton}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Add break form */}
        <section className="space-y-3 border-t border-border-subtle pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.addTitle}
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.masterLabel}
            </span>
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
              <span className="mb-1 block text-xs font-medium text-text-main">
                {T.startLabel}
              </span>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-main">
                {T.endLabel}
              </span>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.noteLabel}
            </span>
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
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
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
