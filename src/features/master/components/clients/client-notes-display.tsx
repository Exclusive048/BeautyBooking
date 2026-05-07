import { Pencil } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.clients.detail.notes;

type Props = {
  notes: string | null;
};

/**
 * Read-only notes block. Edit affordance renders disabled with a "Скоро"
 * tooltip — the actual editor lands in 27b alongside tag mutations and
 * "Add client" flows. Empty state stays small and italic so it doesn't
 * compete with the rest of the card.
 */
export function ClientNotesDisplay({ notes }: Props) {
  return (
    <section className="border-b border-border-subtle py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.heading}
        </p>
        <button
          type="button"
          disabled
          title={T.editComingSoon}
          className="inline-flex cursor-not-allowed items-center gap-1 text-xs text-text-sec/60"
        >
          <Pencil className="h-3 w-3" aria-hidden />
          {T.editLabel}
        </button>
      </div>
      {notes && notes.trim().length > 0 ? (
        <p className="whitespace-pre-wrap rounded-xl bg-bg-input p-3 text-sm text-text-main">
          {notes}
        </p>
      ) : (
        <p className="text-sm italic text-text-sec">{T.empty}</p>
      )}
    </section>
  );
}
