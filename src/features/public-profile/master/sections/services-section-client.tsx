"use client";

import { useEffect, useRef } from "react";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import { ServicesMenu } from "@/features/public-profile/master/services-menu";
import { useSelectedServices } from "@/features/public-profile/master/selected-services-context";

type Props = {
  services: ProviderServiceDto[];
  initialServiceId: string | null;
};

export function ServicesSectionClient({ services, initialServiceId }: Props) {
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
    <ServicesMenu
      services={services}
      selectedServiceIds={selectedServices.map((service) => service.id)}
      onAdd={addService}
    />
  );
}
