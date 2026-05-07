"use client";

import { Zap } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.breaks.footerHint;

/**
 * Footer hint pointing at the Schedule week view's click-to-create flow
 * for one-off slot blocks. The flow itself shipped in 25-A; this is
 * education, not a promise of new behaviour.
 */
export function BreaksFooterHint() {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Zap className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-main">{T.title}</p>
          <p className="mt-0.5 text-xs text-text-sec">{T.body}</p>
        </div>
      </div>
    </div>
  );
}
