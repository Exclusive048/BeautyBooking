"use client";

import { createContext, useContext, type ReactNode } from "react";

const DEFAULT_ENDPOINT = "/api/cabinet/master/schedule";

/**
 * STUDIO-MASTER-PROFILES (этап 4): адрес API настроек расписания для вкладок.
 * У мастера, работающего и лично, и в студии, два расписания: личное (правит
 * сам, сразу) и в студии (через заявку студии). Вкладки одни и те же — меняется
 * только адрес: `?profile=<id профиля в студии>` для студийного.
 */
const ScheduleEndpointContext = createContext<string>(DEFAULT_ENDPOINT);

export function ScheduleEndpointProvider({
  studioProfileId,
  children,
}: {
  studioProfileId: string | null;
  children: ReactNode;
}) {
  const endpoint = studioProfileId
    ? `${DEFAULT_ENDPOINT}?profile=${encodeURIComponent(studioProfileId)}`
    : DEFAULT_ENDPOINT;
  return <ScheduleEndpointContext.Provider value={endpoint}>{children}</ScheduleEndpointContext.Provider>;
}

export function useScheduleEndpoint(): string {
  return useContext(ScheduleEndpointContext);
}
