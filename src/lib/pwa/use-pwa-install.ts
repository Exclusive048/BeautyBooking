"use client";

import { useSyncExternalStore } from "react";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  subscribePwaInstall,
  type PwaInstallSnapshot,
} from "@/lib/pwa/install-state";

/** Состояние установки PWA (общий стор — см. `install-state.ts`). */
export function usePwaInstall(): PwaInstallSnapshot {
  return useSyncExternalStore(subscribePwaInstall, getPwaInstallSnapshot, getPwaInstallServerSnapshot);
}
