"use client";

import { Check, Zap } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { ModeCard } from "../components/mode-card";

const T = UI_TEXT.cabinetMaster.scheduleSettings.rules.confirmation;

type Props = {
  autoConfirm: boolean;
  onChange: (next: boolean) => void;
};

/**
 * "Подтверждение записи" — pair of mode cards (auto vs manual). Mirrors
 * the FLEXIBLE/FIXED toggle pattern from the Hours tab so the visual
 * language is consistent across settings.
 */
export function ConfirmationSection({ autoConfirm, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="mb-4 font-display text-lg text-text-main">{T.title}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ModeCard
          active={autoConfirm}
          icon={Zap}
          title={T.autoLabel}
          description={T.autoDescription}
          onClick={() => onChange(true)}
        />
        <ModeCard
          active={!autoConfirm}
          icon={Check}
          title={T.manualLabel}
          description={T.manualDescription}
          onClick={() => onChange(false)}
        />
      </div>
    </section>
  );
}
