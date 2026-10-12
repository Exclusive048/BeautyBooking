"use client";

import { useEffect, useRef, useState } from "react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { BookingFlowStepper } from "@/features/booking/components/booking-flow/booking-flow-stepper";
import type { BookingFlowPhase } from "@/features/booking/components/booking-flow/types";
import { StepsBar, type WizardStep } from "@/features/public-studio/studio-booking-flow/components/steps-bar";
import { ServiceStep } from "@/features/public-studio/studio-booking-flow/components/steps/service-step";
import { StepTransition } from "@/features/public-studio/studio-booking-flow/components/step-transition";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { scrollBehavior } from "@/lib/ui/scroll";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  provider: Pick<ProviderProfileDto, "id" | "name" | "timezone" | "services">;
  open: boolean;
  onClose: () => void;
  /** Услуга, с которой открыто окно; нет или неизвестна — первый шаг «Услуга». */
  initialServiceId: string | null;
  /** `?slotStartAt=` (поиск по времени) — день, который покажет выбор времени. */
  initialSlotStartAt: string | null;
};

/**
 * BOOKING-WIDGET-DIALOG — окно записи к мастеру: услуга → время → контакты,
 * те же шаги и та же полоса шагов, что у окна студии (шага «Мастер» нет).
 * Время и контакты ведёт прежний степпер записи (`BookingFlowStepper`) —
 * запрос записи, согласия гостя и экран успеха не менялись.
 */
export function MasterBookingDialog({ provider, open, onClose, initialServiceId, initialSlotStartAt }: Props) {
  const services = provider.services;
  const [initialService] = useState(() => {
    const match = initialServiceId ? services.find((service) => service.id === initialServiceId) : undefined;
    // Одна услуга — выбирать нечего, окно открывается сразу на времени.
    return match ?? (services.length === 1 ? services[0] : null);
  });
  const [serviceId, setServiceId] = useState<string | null>(initialService?.id ?? null);
  const [phase, setPhase] = useState<BookingFlowPhase>("selection");
  const [direction, setDirection] = useState(1);
  const focusAnchorRef = useRef<HTMLDivElement>(null);

  const selected = serviceId ? services.find((service) => service.id === serviceId) ?? null : null;
  const step: WizardStep = !selected ? "service" : phase === "form" ? "you" : "when";
  const done = new Set<WizardStep>();
  if (selected) done.add("service");
  if (phase === "form" || phase === "success") done.add("when");

  // Новый шаг — с начала: иначе после выбора времени внизу сетки контакты
  // открывались прокрученными до середины.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    const scroller = focusAnchorRef.current?.closest('[role="dialog"]');
    if (scroller && scroller.scrollTop > 0) scroller.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [step, phase]);

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      fullScreenOnMobile
      size="lg"
      header={{ title: UI_TEXT.bookingWidget.dialogTitle, subtitle: provider.name }}
      // Без этого фокус встаёт в поиск услуг, и на телефоне клавиатура
      // закрывает список при открытии окна.
      initialFocusRef={focusAnchorRef}
    >
      <div ref={focusAnchorRef} tabIndex={-1} className="space-y-4 outline-none">
        {phase !== "success" ? <StepsBar active={step} done={done} scenarioB /> : null}
        <StepTransition step={selected ? "when" : "service"} direction={direction}>
          {selected ? (
            <BookingFlowStepper
              providerId={provider.id}
              providerName={provider.name}
              serviceId={selected.id}
              serviceName={selected.name}
              servicePrice={selected.price}
              serviceDurationMin={selected.durationMin}
              providerTimezone={provider.timezone}
              initialSlotStartAt={selected.id === initialService?.id ? initialSlotStartAt : null}
              onPhaseChange={setPhase}
              onChangeService={
                services.length > 1
                  ? () => {
                      setDirection(-1);
                      setPhase("selection");
                      setServiceId(null);
                    }
                  : undefined
              }
            />
          ) : (
            <ServiceStep
              services={services}
              masters={[]}
              selectedServiceId={serviceId ?? ""}
              prefilledMaster={null}
              subtitle={UI_TEXT.bookingWidget.serviceStep.subtitleSolo}
              onPick={(id) => {
                setDirection(1);
                setServiceId(id);
              }}
            />
          )}
        </StepTransition>
      </div>
    </ModalSurface>
  );
}
