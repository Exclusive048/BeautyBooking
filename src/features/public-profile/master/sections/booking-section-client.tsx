"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { useSelectedServices } from "@/features/public-profile/master/selected-services-context";
import { BOOKING_OPEN_SHEET_EVENT } from "@/features/public-profile/master/mobile-booking-cta";
import { UI_TEXT } from "@/lib/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { studioBookingUrl } from "@/lib/public-urls";
import { BookingFlowStepper } from "@/features/booking/components/booking-flow/booking-flow-stepper";
import { BookingBottomSheet } from "@/features/booking/components/booking-flow/booking-bottom-sheet";

const tB = UI_TEXT.publicProfile.booking;
const tP = UI_TEXT.publicProfile.page;

type Props = {
  provider: ProviderProfileDto;
  initialSlotStartAt: string | null;
  studioPublicUsername: string | null;
};

export function BookingSectionClient({ provider, initialSlotStartAt, studioPublicUsername }: Props) {
  const { selectedServices } = useSelectedServices();
  const [sheetOpen, setSheetOpen] = useState(false);

  const primaryService = selectedServices[0] ?? null;
  const masterKey = provider.publicUsername?.trim() ?? "";
  const masterProfileUrl = masterKey ? `/u/${masterKey}` : undefined;

  // Open the bottom sheet when MobileBookingCta fires the event
  useEffect(() => {
    function handleOpen() {
      if (primaryService) setSheetOpen(true);
    }
    document.addEventListener(BOOKING_OPEN_SHEET_EVENT, handleOpen);
    return () => document.removeEventListener(BOOKING_OPEN_SHEET_EVENT, handleOpen);
  }, [primaryService]);

  // Studio master → redirect to studio booking
  const studioBookingHref =
    provider.type === "MASTER" && provider.studioId
      ? studioBookingUrl(
          { id: provider.studioId, publicUsername: studioPublicUsername },
          // STUDIO-MASTER-PROFILES (этап 4): у разделённого мастера в студии
          // работает его профиль в студии — выбираем его по id; до разделения
          // мастер в студии — сам личный профиль (по адресу страницы).
          provider.studioMasterProfileId
            ? { masterId: provider.studioMasterProfileId, serviceId: selectedServices[0]?.id }
            : {
                master: masterKey || undefined,
                masterId: masterKey ? undefined : provider.id,
                serviceId: selectedServices[0]?.id,
              },
          "master-studio-booking"
        )
      : null;

  // STUDIO-MASTER-OWN-BOOKINGS-01: мастер студии со своими услугами продаёт их
  // здесь; на студийные ведёт отдельная ссылка под виджетом.
  const studioLinkBelowWidget = provider.sellsOwnServices && studioBookingHref;

  if (studioBookingHref && !provider.sellsOwnServices) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="text-sm font-semibold text-text-main">{tP.studioBookingTitle}</div>
          <div className="text-sm text-text-sec">{tP.studioBookingDescription}</div>
          <Link
            href={studioBookingHref}
            className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-medium text-accent-foreground shadow-card transition hover:shadow-hover"
          >
            {tP.studioBookingCta}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* ── Desktop: inline stepper in right sidebar ── */}
      <div className="lux-card rounded-[26px] p-5 text-text-main">
        <div className="mb-4 text-lg font-semibold">{tB.title}</div>

        {primaryService ? (
          <BookingFlowStepper
            providerId={provider.id}
            providerName={provider.name}
            serviceId={primaryService.id}
            serviceName={primaryService.name}
            servicePrice={primaryService.price}
            serviceDurationMin={primaryService.durationMin}
            providerTimezone={provider.timezone}
            initialSlotStartAt={initialSlotStartAt}
            masterProfileUrl={masterProfileUrl}
          />
        ) : (
          // FIX-BATCH-C Defect 2: distinguish empty-CART (has services, none
          // selected yet) from empty-CATALOG (master added no services). Showing
          // "мастер ещё не добавил услуги" beside bookable services is a
          // conversion-killing lie; prompt to pick a service instead.
          <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-4">
            {provider.services.length > 0 ? (
              <>
                <div className="text-sm font-medium">{tB.selectServiceTitle}</div>
                <div className="mt-2 text-sm text-text-sec">{tB.selectServiceDesc}</div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">{tB.emptyTitle}</div>
                <div className="mt-2 text-sm text-text-sec">{tB.emptyDesc}</div>
              </>
            )}
          </div>
        )}

        {studioLinkBelowWidget ? (
          <Link
            href={studioBookingHref}
            className="mt-4 block text-center text-sm font-medium text-accent-text underline decoration-border-subtle underline-offset-4 transition hover:decoration-accent-text"
          >
            {tP.studioBookingAlso}
          </Link>
        ) : null}
      </div>

      {/* ── Mobile: bottom sheet (opened by MobileBookingCta) ── */}
      {primaryService && (
        <BookingBottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          providerId={provider.id}
          providerName={provider.name}
          serviceId={primaryService.id}
          serviceName={primaryService.name}
          servicePrice={primaryService.price}
          serviceDurationMin={primaryService.durationMin}
          providerTimezone={provider.timezone}
          masterProfileUrl={masterProfileUrl}
        />
      )}
    </>
  );
}
