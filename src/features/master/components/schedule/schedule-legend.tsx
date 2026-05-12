import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.legend;

/**
 * Visual legend for the four card variants used in the week grid. Static
 * server-rendered swatches — no interactivity, just key.
 */
export function ScheduleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-text-sec">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 rounded bg-brand-gradient" />
        {T.confirmed}
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded border border-amber-400/60 bg-amber-100/40"
        />
        {T.pending}
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded border border-emerald-500/60 bg-emerald-100/40"
        />
        {T.newClient}
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded border border-dashed border-text-sec/50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgb(var(--bg-input)) 0 3px, transparent 3px 6px)",
          }}
        />
        {T.blocked}
      </span>
    </div>
  );
}
