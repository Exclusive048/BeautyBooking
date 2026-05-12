"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import { ServiceHeader } from "@/features/booking/components/booking-flow/components/service-header";
import { DateGrid } from "@/features/booking/components/booking-flow/components/date-grid";
import { TimeGrid } from "@/features/booking/components/booking-flow/components/time-grid";
import { SummaryBlock } from "@/features/booking/components/booking-flow/components/summary-block";
import { Footnote } from "@/features/booking/components/booking-flow/components/footnote";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

const T = UI_TEXT.publicProfile.bookingWidget;

type Props = {
  providerId: string;
  providerTimezone: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  selectedDateKey: string | null;
  selectedSlot: BookingFlowSlot | null;
  onSelectDate: (dateKey: string) => void;
  onSelectSlot: (slot: BookingFlowSlot) => void;
  onContinue: () => void;
};

/**
 * Phase 1 of the booking flow — pick a date AND a time on the same
 * screen (matches the design reference). The summary at the bottom
 * only renders once both are chosen, keeping the screen quiet during
 * the initial pick.
 */
export function SelectionPhase({
  providerId,
  providerTimezone,
  serviceId,
  serviceName,
  servicePrice,
  serviceDurationMin,
  selectedDateKey,
  selectedSlot,
  onSelectDate,
  onSelectSlot,
  onContinue,
}: Props) {
  const canContinue = Boolean(selectedDateKey && selectedSlot);

  return (
    <div className="space-y-5 p-5">
      <ServiceHeader
        serviceName={serviceName}
        servicePrice={servicePrice}
        serviceDurationMin={serviceDurationMin}
        slot={selectedSlot}
      />

      <DateGrid
        providerId={providerId}
        selectedDateKey={selectedDateKey}
        onSelect={onSelectDate}
      />

      {selectedDateKey ? (
        <TimeGrid
          providerId={providerId}
          serviceId={serviceId}
          dateKey={selectedDateKey}
          providerTimezone={providerTimezone}
          selectedSlot={selectedSlot}
          onSelect={onSelectSlot}
        />
      ) : null}

      {canContinue ? (
        <SummaryBlock
          serviceName={serviceName}
          servicePrice={servicePrice}
          serviceDurationMin={serviceDurationMin}
          slot={selectedSlot}
          dateKey={selectedDateKey}
          providerTimezone={providerTimezone}
        />
      ) : null}

      <Button
        size="lg"
        disabled={!canContinue}
        onClick={onContinue}
        className="w-full gap-1.5"
      >
        {T.continueCta}
        <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={1.8} />
      </Button>

      <Footnote variant="selection" />
    </div>
  );
}
