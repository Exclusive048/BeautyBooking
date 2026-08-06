"use client";

import { ArrowLeft, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioMaster, SlotItem } from "@/features/booking/lib/studio-booking";

export const ANY_MASTER_ID = "__any__";

type Props = {
  masters: StudioMaster[];
  availabilityByMaster: Record<string, { serviceAvailable: boolean; slots: SlotItem[] }>;
  selectedMasterId: string;
  selectedServiceName: string;
  /** Salon (provider) timezone — the "next window" preview is shown in this zone. */
  salonTimeZone: string;
  onPick: (masterId: string) => void;
  onBack: () => void;
};

export function MasterStep({
  masters,
  availabilityByMaster,
  selectedMasterId,
  selectedServiceName,
  salonTimeZone,
  onPick,
  onBack,
}: Props) {
  const available = masters.filter((m) => availabilityByMaster[m.id]?.serviceAvailable !== false);

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-accent-text">
          <User className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-text sm:text-xl">
            {UI_TEXT.bookingWidget.masterStep.title}
          </h2>
          <p className="truncate text-xs text-text-muted sm:text-sm">
            {UI_TEXT.bookingWidget.masterStep.subtitle.replace("{service}", selectedServiceName)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="text-text-muted">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
          {UI_TEXT.bookingWidget.masterStep.back}
        </Button>
      </header>

      {available.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-muted/40 p-8 text-center text-sm text-text-muted">
          {UI_TEXT.bookingWidget.masterStep.noMasters}
        </div>
      ) : (
        <ul className="space-y-2.5">
          <li>
            <Button
              type="button"
              variant={selectedMasterId === ANY_MASTER_ID ? "primary" : "secondary"}
              size="none"
              onClick={() => onPick(ANY_MASTER_ID)}
              className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
                selectedMasterId === ANY_MASTER_ID
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border-subtle hover:border-primary/60"
              }`}
              aria-pressed={selectedMasterId === ANY_MASTER_ID}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-amber-400/60 to-primary/60 text-white" aria-hidden>
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{UI_TEXT.bookingWidget.masterStep.anyMaster}</div>
                  <div className="text-xs opacity-80">{UI_TEXT.bookingWidget.masterStep.anyMasterSub}</div>
                </div>
              </div>
            </Button>
          </li>
          {available.map((master) => {
            const isSelected = master.id === selectedMasterId;
            return (
              <li key={master.id}>
                <Button
                  type="button"
                  variant={isSelected ? "primary" : "secondary"}
                  size="none"
                  onClick={() => onPick(master.id)}
                  className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border-subtle hover:border-primary/60"
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-semibold text-white" aria-hidden>
                      {master.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{master.name}</div>
                      {availabilityByMaster[master.id]?.slots[0] ? (
                        <div className="text-xs opacity-80">
                          {/* FIX-BATCH-C Defect 1: preview the next window in the
                              SALON's timezone, consistent with steps 3-4 (was the
                              browser's local zone via a tz-less toLocaleString). */}
                          {new Date(availabilityByMaster[master.id]!.slots[0]!.startAtUtc).toLocaleString("ru-RU", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: salonTimeZone,
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
