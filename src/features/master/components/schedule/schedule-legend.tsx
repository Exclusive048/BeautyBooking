import { Building2, UserRound } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.legend;
const TC = UI_TEXT.cabinetMaster.workContext;

/**
 * Visual legend for the four card variants used in the week grid. Static
 * server-rendered swatches — no interactivity, just key.
 */
export function ScheduleLegend({ showWorkContext = false }: { showWorkContext?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-text-sec">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 rounded bg-brand-gradient" />
        {T.confirmed}
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded border border-warning/60 bg-warning-surface"
        />
        {T.pending}
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded border border-success/60 bg-success-surface"
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
      {/* STUDIO-MASTER-PROFILES (этап 3): те же иконки, что в строке времени карточки. */}
      {showWorkContext ? (
        <>
          <span className="inline-flex items-center gap-2">
            <UserRound aria-hidden className="h-3 w-3" />
            {TC.legendPersonal}
          </span>
          <span className="inline-flex items-center gap-2">
            <Building2 aria-hidden className="h-3 w-3" />
            {TC.legendStudio}
          </span>
        </>
      ) : null}
    </div>
  );
}
