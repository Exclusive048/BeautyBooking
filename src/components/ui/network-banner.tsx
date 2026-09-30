"use client";

import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { useNetworkStatus } from "@/hooks/use-network-status";
import * as UI_TEXT from "@/lib/ui/text";

export function NetworkBanner() {
  // MODAL-SSR-OPEN-HYDRATION: локальная копия хука вынесена в общий
  // `useIsHydrated` — тот же идиом теперь гейтит и портальные примитивы.
  const mounted = useIsHydrated();
  const { isOnline, justReconnected } = useNetworkStatus();

  if (!mounted) return null;

  if (!isOnline) {
    return (
      <div className="fixed left-0 right-0 top-0 z-nav pt-[var(--safe-area-inset-top)] pointer-events-none">
        <div className="pointer-events-auto bg-destructive px-4 py-2 text-center text-xs font-medium text-white">
          {UI_TEXT.network.offline}
        </div>
      </div>
    );
  }

  if (justReconnected) {
    return (
      <div className="fixed left-0 right-0 top-0 z-nav pt-[var(--safe-area-inset-top)] pointer-events-none">
        <div className="pointer-events-auto bg-success px-4 py-2 text-center text-xs font-medium text-white">
          {UI_TEXT.network.reconnected}
        </div>
      </div>
    );
  }

  return null;
}
