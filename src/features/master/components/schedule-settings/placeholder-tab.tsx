"use client";

import { Construction } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.placeholders;

type Props = {
  title: string;
  body: string;
};

/**
 * Generic "coming soon" panel for the four disabled settings tabs.
 * Active in the URL state but inert — clicking the tab triggers nothing
 * because the tab itself is rendered with `disabled` in <SettingsTabs>.
 * The component exists so the layout doesn't collapse if a deep link
 * forces a placeholder tab into view.
 */
export function PlaceholderTab({ title, body }: Props) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-8 text-text-sec">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-input px-2.5 py-1 text-xs uppercase tracking-wide">
        <Construction className="h-3 w-3" aria-hidden />
        {T.comingSoon}
      </span>
      <h2 className="font-display text-xl text-text-main">{title}</h2>
      <p className="max-w-prose text-sm">{body}</p>
    </div>
  );
}
