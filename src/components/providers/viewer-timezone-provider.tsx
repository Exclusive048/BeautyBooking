"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getViewerTimeZone } from "@/lib/time/use-viewer-timezone";

const ViewerTimeZoneContext = createContext<string>("Europe/Moscow");

export function ViewerTimeZoneProvider({ children }: { children: ReactNode }) {
  const [timeZone] = useState(() => getViewerTimeZone());

  return <ViewerTimeZoneContext.Provider value={timeZone}>{children}</ViewerTimeZoneContext.Provider>;
}

export function useViewerTimeZoneContext(): string {
  return useContext(ViewerTimeZoneContext);
}
