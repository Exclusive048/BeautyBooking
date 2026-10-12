"use client";

import type { ProviderServiceDto } from "@/lib/providers/dto";
import type { PublicBundleView } from "@/lib/master/public-profile-view.service";
import { ServicesMenu } from "@/features/public-profile/master/services-menu";
import { BundleCard } from "@/features/public-profile/master/components/bundle-card";
import { useMasterBooking } from "@/features/public-profile/master/booking-dialog-context";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  services: ProviderServiceDto[];
  bundles: PublicBundleView[];
  providerId: string;
  providerTimezone: string;
  /** PACKAGE-SOLO-WIZARD-01: the master's between-bookings buffer — the package wizard's cursor gap. */
  providerBufferMin: number;
  packageBookable: boolean;
  /** Не владелец страницы — у услуг есть «Записаться». */
  bookable: boolean;
};

const T = UI_TEXT.publicProfile.bundles;

export function ServicesSectionClient({
  services,
  bundles,
  providerId,
  providerTimezone,
  providerBufferMin,
  packageBookable,
  bookable,
}: Props) {
  const booking = useMasterBooking();

  return (
    <div className="space-y-6">
      <ServicesMenu
        services={services}
        onBook={bookable && booking ? (service) => booking.openBooking(service.id) : undefined}
      />

      {bundles.length > 0 ? (
        <section>
          <div className="mb-3">
            <div className="text-2xs uppercase tracking-wider text-text-sec">
              {T.eyebrow}
            </div>
            <h2 className="font-display text-lg text-text-main">{T.heading}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {bundles.map((bundle, index) => (
              <BundleCard
                key={`${bundle.name}-${index}`}
                bundle={bundle}
                providerId={providerId}
                providerTimezone={providerTimezone}
                providerBufferMin={providerBufferMin}
                bookable={packageBookable}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
