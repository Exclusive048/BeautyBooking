"use client";

import { Switch } from "@/components/ui/switch";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.visibility.newClients;

type Props = {
  acceptNewClients: boolean;
  onChange: (next: boolean) => void;
};

/**
 * "Принимать новых клиентов" — single switch. When off, public booking
 * is restricted to clients who already have a booking history with the
 * provider (enforcement happens in the booking-creation guard, separate
 * from this UI).
 */
export function NewClientsSection({ acceptNewClients, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-lg text-text-main">{T.title}</h2>
      <p className="mt-1 max-w-prose text-sm text-text-sec">{T.body}</p>
      <div className="mt-4 flex items-center gap-3">
        <Switch checked={acceptNewClients} onCheckedChange={onChange} aria-label={T.toggleLabel} />
        <span className="text-sm text-text-main">{T.toggleLabel}</span>
      </div>
    </section>
  );
}
