import { Sparkles } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.notifications;

/**
 * Placeholder card for the 4-categories × 3-channels event grid.
 * Schema (`NotificationPreference`) and classifier extension haven't
 * shipped — this card sets expectations honestly so the master knows
 * granular preferences are coming, not missing.
 */
export function PerEventPlaceholder() {
  return (
    <section className="rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div>
          <h3 className="font-display text-base text-text-main">{T.perEventTitle}</h3>
          <p className="mt-1 text-sm leading-relaxed text-text-sec">{T.perEventBody}</p>
        </div>
      </div>
    </section>
  );
}
