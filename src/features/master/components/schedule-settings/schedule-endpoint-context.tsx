"use client";

import { createContext, useContext, type ReactNode } from "react";

const DEFAULT_ENDPOINT = "/api/cabinet/master/schedule";

/**
 * STUDIO-MASTER-PROFILES (этап 4): адрес API настроек расписания для вкладок.
 * У мастера, работающего и лично, и в студии, два расписания: личное (правит
 * сам, сразу) и в студии (через заявку студии). Вкладки одни и те же — меняется
 * только адрес: `?profile=<id профиля в студии>` для студийного.
 */
type ScheduleEndpointValue = { endpoint: string; studioProfile: boolean };

const ScheduleEndpointContext = createContext<ScheduleEndpointValue>({
  endpoint: DEFAULT_ENDPOINT,
  studioProfile: false,
});

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
  return (
    <ScheduleEndpointContext.Provider value={{ endpoint, studioProfile: studioProfileId !== null }}>
      {children}
    </ScheduleEndpointContext.Provider>
  );
}

export function useScheduleEndpoint(): string {
  return useContext(ScheduleEndpointContext).endpoint;
}

/**
 * SCHEDULE-PATTERNS-01: адрес графика (`…/schedule/pattern`) с теми же
 * параметрами, что у основного адреса (`?profile=`, `?studioId=&masterId=`).
 */
export function schedulePatternEndpoint(endpoint: string, suffix = ""): string {
  return scheduleSubEndpoint(endpoint, `/pattern${suffix}`);
}

/** Этап 3: `…/schedule/calendar`, `…/schedule/palette[/id]` с теми же параметрами профиля. */
export function scheduleSubEndpoint(endpoint: string, subPath: string): string {
  const [path, query] = endpoint.split("?");
  return `${path}${subPath}${query ? `?${query}` : ""}`;
}

/**
 * Открыто расписание профиля в студии. Видимость СТРАНИЦЫ — свойство личного
 * профиля (у профиля в студии страницы нет), поэтому переключатель «Показывать
 * в каталоге» здесь не показывается.
 */
export function useIsStudioProfileSchedule(): boolean {
  return useContext(ScheduleEndpointContext).studioProfile;
}
