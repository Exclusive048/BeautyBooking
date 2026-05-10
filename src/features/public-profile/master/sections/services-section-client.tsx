"use client";

import { useEffect, useRef } from "react";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import type { PublicBundleView } from "@/lib/master/public-profile-view.service";
import { ServicesMenu } from "@/features/public-profile/master/services-menu";
import { BundleCard } from "@/features/public-profile/master/components/bundle-card";
import { useSelectedServices } from "@/features/public-profile/master/selected-services-context";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  services: ProviderServiceDto[];
  bundles: PublicBundleView[];
  initialServiceId: string | null;
};

const T = UI_TEXT.publicProfile.bundles;

export function ServicesSectionClient({ services, bundles, initialServiceId }: Props) {
  const { selectedServices, addService, setSelectedServices } = useSelectedServices();
  const initialAppliedRef = useRef(false);

  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (!initialServiceId) return;
    const match = services.find((service) => service.id === initialServiceId);
    if (match) {
      setSelectedServices([match]);
      initialAppliedRef.current = true;
    }
  }, [initialServiceId, services, setSelectedServices]);

  return (
    <div className="space-y-6">
      <ServicesMenu
        services={services}
        selectedServiceIds={selectedServices.map((service) => service.id)}
        onAdd={addService}
      />

      {bundles.length > 0 ? (
        <section>
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-text-sec">
              {T.eyebrow}
            </div>
            <h2 className="font-display text-lg text-text-main">{T.heading}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {bundles.map((bundle) => (
              <BundleCard key={bundle.id} bundle={bundle} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
