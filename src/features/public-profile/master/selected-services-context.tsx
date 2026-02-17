"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ProviderServiceDto } from "@/lib/providers/dto";

type SelectedServicesState = {
  selectedServices: ProviderServiceDto[];
  setSelectedServices: (services: ProviderServiceDto[]) => void;
  addService: (service: ProviderServiceDto) => void;
  removeService: (serviceId: string) => void;
};

const SelectedServicesContext = createContext<SelectedServicesState | null>(null);

export function SelectedServicesProvider({ children }: { children: React.ReactNode }) {
  const [selectedServices, setSelectedServices] = useState<ProviderServiceDto[]>([]);

  const addService = useCallback((service: ProviderServiceDto) => {
    setSelectedServices((prev) => (prev.some((item) => item.id === service.id) ? prev : [...prev, service]));
  }, []);

  const removeService = useCallback((serviceId: string) => {
    setSelectedServices((prev) => prev.filter((service) => service.id !== serviceId));
  }, []);

  const value = useMemo(
    () => ({
      selectedServices,
      setSelectedServices,
      addService,
      removeService,
    }),
    [addService, removeService, selectedServices]
  );

  return <SelectedServicesContext.Provider value={value}>{children}</SelectedServicesContext.Provider>;
}

export function useSelectedServices() {
  const ctx = useContext(SelectedServicesContext);
  if (!ctx) {
    throw new Error("useSelectedServices must be used within SelectedServicesProvider");
  }
  return ctx;
}
