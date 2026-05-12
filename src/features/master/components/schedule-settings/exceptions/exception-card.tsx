"use client";

import { Ban, Minus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { formatExceptionRange, type ExceptionGroup } from "../lib/format-helpers";

const T = UI_TEXT.cabinetMaster.scheduleSettings.exceptions;

type Props = {
  group: ExceptionGroup;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Single exception group. Rendered as a row with type badge + title +
 * date/time subtitle + edit/delete actions. Title falls back to a generic
 * "Выходной" / "Сокращённый день" when the underlying `note` is empty.
 */
export function ExceptionCard({ group, onEdit, onDelete }: Props) {
  const isOff = group.kind === "OFF";
  const Icon = isOff ? Ban : Minus;
  const title =
    group.note?.trim() || (isOff ? T.kind.offFallback : T.kind.shortFallback);
  const { confirm, modal } = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      message: T.deleteConfirm,
      variant: "danger",
    });
    if (ok) onDelete();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div
        className={cn(
          "relative flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-lg",
          isOff
            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.1em]">
          {isOff ? T.kind.offBadge : T.kind.shortBadge}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-main">{title}</p>
        <p className="mt-0.5 truncate text-xs text-text-sec">{formatExceptionRange(group)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
          {T.editCta}
        </Button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-sec transition-colors hover:bg-bg-input hover:text-rose-600"
          aria-label={T.deleteAria}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {modal}
    </div>
  );
}
