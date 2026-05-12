"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { RecurringBreakGroup } from "../lib/format-helpers";
import { BreakCard } from "./break-card";

const T = UI_TEXT.cabinetMaster.scheduleSettings.breaks.recurring;

type Props = {
  groups: RecurringBreakGroup[];
  onAdd: () => void;
  onDelete: (group: RecurringBreakGroup) => void;
};

/**
 * Recurring-breaks list. Groups are derived in `groupRecurringBreaks` from
 * `weekSchedule[].breaks` — single source of truth shared with the Hours
 * tab. Adding a recurring break appends per-day rows; deleting removes
 * them all at once.
 */
export function RecurringBreaksSection({ groups, onAdd, onDelete }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg text-text-main">{T.title}</h2>
          <p className="mt-1 text-sm text-text-sec">{T.subtitle}</p>
        </div>
        <Button type="button" variant="primary" size="sm" className="rounded-xl" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          {T.addCta}
        </Button>
      </header>

      {groups.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {groups.map((group) => (
            <BreakCard
              key={group.signature}
              group={group}
              onDelete={() => onDelete(group)}
            />
          ))}
        </div>
      ) : (
        <p className="py-3 text-center text-sm text-text-sec">{T.emptyBody}</p>
      )}
    </section>
  );
}
