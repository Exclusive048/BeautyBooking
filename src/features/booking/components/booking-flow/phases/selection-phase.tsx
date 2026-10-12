"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
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
  /** Вернуться к выбору услуги; без него кнопки нет (услуга у мастера одна). */
  onChangeService?: () => void;
};

/**
 * Phase 1 of the booking flow — pick a date AND a time on the same
 * screen (matches the design reference).
 *
 * BOOKING-WIDGET-DIALOG: выбор времени сам ведёт к контактам, поэтому
 * «Продолжить» со сводкой видны только после возврата сюда с выбранным
 * временем («Изменить время») — выключенная кнопка под сеткой ничего не
 * объясняла.
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
  onChangeService,
}: Props) {
  const canContinue = Boolean(selectedDateKey && selectedSlot);

  return (
    <div className="space-y-5">
      {/* На телефоне кнопка уходит под цену — рядом с ней строка «длительность ·
          услуга» ломалась посередине. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <ServiceHeader
            serviceName={serviceName}
            servicePrice={servicePrice}
            serviceDurationMin={serviceDurationMin}
            slot={selectedSlot}
          />
        </div>
        {onChangeService ? (
          <Button type="button" variant="secondary" size="sm" onClick={onChangeService} className="shrink-0">
            {T.changeService}
          </Button>
        ) : null}
      </div>

      <DateGrid
        providerId={providerId}
        providerTimezone={providerTimezone}
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
        <>
          <SummaryBlock
            serviceName={serviceName}
            servicePrice={servicePrice}
            serviceDurationMin={serviceDurationMin}
            slot={selectedSlot}
            dateKey={selectedDateKey}
          />
          <Button size="lg" onClick={onContinue} className="w-full gap-1.5">
            {T.continueCta}
            <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={1.8} />
          </Button>
        </>
      ) : null}

      <Footnote variant="selection" />
    </div>
  );
}
