"use client";

import { UI_TEXT } from "@/lib/ui/text";
import { ChipGroup } from "../components/chip-group";

const T = UI_TEXT.cabinetMaster.scheduleSettings.breaks.buffer;

const OPTIONS = [
  { value: 0, label: T.options["0"] },
  { value: 5, label: T.options["5"] },
  { value: 10, label: T.options["10"] },
  { value: 15, label: T.options["15"] },
  { value: 20, label: T.options["20"] },
  { value: 30, label: T.options["30"] },
];

type Props = {
  value: number;
  onChange: (next: number) => void;
};

/**
 * Buffer-between-bookings setting. Maps to `Provider.bufferBetweenBookingsMin`.
 * Lives at the top of the Breaks tab — short, single-line decision.
 */
export function BufferSection({ value, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-lg text-text-main">{T.title}</h2>
      <p className="mt-1 max-w-prose text-sm text-text-sec">{T.subtitle}</p>
      <div className="mt-4">
        <ChipGroup value={value} onChange={onChange} options={OPTIONS} />
      </div>
    </section>
  );
}
