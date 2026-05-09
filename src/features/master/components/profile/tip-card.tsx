import { Lightbulb } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.profile.sidebar;

/** Bottom-of-sidebar advisory card — single sentence, no CTA. */
export function TipCard() {
  return (
    <aside className="rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 p-3">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.tipEyebrow}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-sec">{T.tipBody}</p>
        </div>
      </div>
    </aside>
  );
}
