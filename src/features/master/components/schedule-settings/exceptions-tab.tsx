"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditorExceptionInput, ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { ExceptionCard } from "./exceptions/exception-card";
import { ExceptionEmptyState } from "./exceptions/exception-empty-state";
import { ExceptionModal } from "./exceptions/exception-modal";
import {
  groupConsecutiveExceptions,
  type ExceptionGroup,
} from "./lib/format-helpers";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Submitted = Array<Pick<
  EditorExceptionInput,
  "date" | "isWorkday" | "scheduleMode" | "startTime" | "endTime" | "breaks" | "fixedSlotTimes" | "note"
>>;

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * Exceptions tab — list of `ScheduleOverride` rows grouped by consecutive
 * same-attribute days into visual cards, plus add/edit/delete via modal.
 *
 * Save flow uses the new full-list PATCH key (`bookingExceptions: [...]`).
 * The legacy single-row path keeps working for the studio cabinet, but
 * the master cabinet's tab always sends the full list.
 *
 * Edit doesn't preserve row IDs across re-emits — backend matches by
 * `date` (unique per provider), so identity is stable from the user's
 * perspective even though server IDs may change after save.
 */
export function ExceptionsTab({ initialSnapshot }: Props) {
  const [draft, setDraft] = useState<EditorExceptionInput[]>(() =>
    initialSnapshot.exceptions.map(toInput)
  );
  const [baseline, setBaseline] = useState<EditorExceptionInput[]>(() =>
    initialSnapshot.exceptions.map(toInput)
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExceptionGroup | null>(null);

  const { setStatus, setErrorMessage } = useSaveStatus();

  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      const response = await fetch("/api/cabinet/master/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingExceptions: value }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!response.ok || !json || !json.ok) {
        const message = json && !json.ok ? json.error.message : T.errors.save;
        return { ok: false, message };
      }
      return { ok: true };
    },
    setStatus,
    setErrorMessage,
    onSaved: (value) => setBaseline(value),
  });

  const groups = useMemo(
    () => groupConsecutiveExceptions(draft.map(toExceptionDto)),
    [draft]
  );

  const openAdd = () => {
    setEditingGroup(null);
    setModalOpen(true);
  };

  const openEdit = (group: ExceptionGroup) => {
    setEditingGroup(group);
    setModalOpen(true);
  };

  const deleteGroup = (group: ExceptionGroup) => {
    const groupDates = new Set(group.rows.map((row) => row.date));
    setDraft((prev) => prev.filter((row) => !groupDates.has(row.date)));
  };

  const handleSubmit = (rows: Submitted) => {
    const newDates = new Set(rows.map((row) => row.date));
    const removeDates = editingGroup
      ? new Set(editingGroup.rows.map((row) => row.date))
      : new Set<string>();
    setDraft((prev) => {
      const filtered = prev.filter(
        (row) => !removeDates.has(row.date) && !newDates.has(row.date)
      );
      return [...filtered, ...rows].sort((left, right) => left.date.localeCompare(right.date));
    });
    setModalOpen(false);
    setEditingGroup(null);
  };

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg text-text-main">{T.exceptions.title}</h2>
          <p className="mt-1 text-sm text-text-sec">{T.exceptions.subtitle}</p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          className="rounded-xl"
          onClick={openAdd}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {T.exceptions.addCta}
        </Button>
      </header>

      {groups.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {groups.map((group) => (
            <ExceptionCard
              key={`${group.startDate}-${group.endDate}-${group.id}`}
              group={group}
              onEdit={() => openEdit(group)}
              onDelete={() => deleteGroup(group)}
            />
          ))}
        </div>
      ) : (
        <ExceptionEmptyState onAdd={openAdd} />
      )}

      {modalOpen ? (
        <ExceptionModal
          key={editingGroup?.id ?? "new"}
          editing={editingGroup}
          onClose={() => {
            setModalOpen(false);
            setEditingGroup(null);
          }}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  );
}

function toInput(row: ScheduleEditorSnapshot["exceptions"][number]): EditorExceptionInput {
  return {
    date: row.date,
    isWorkday: row.isWorkday,
    scheduleMode: row.scheduleMode,
    startTime: row.startTime,
    endTime: row.endTime,
    breaks: row.breaks,
    fixedSlotTimes: row.fixedSlotTimes,
    note: row.note,
  };
}

function toExceptionDto(
  row: EditorExceptionInput
): ScheduleEditorSnapshot["exceptions"][number] {
  return {
    id: `draft-${row.date}`,
    date: row.date,
    isWorkday: row.isWorkday,
    scheduleMode: row.scheduleMode,
    startTime: row.startTime,
    endTime: row.endTime,
    breaks: row.breaks,
    fixedSlotTimes: row.fixedSlotTimes,
    note: row.note,
  };
}
