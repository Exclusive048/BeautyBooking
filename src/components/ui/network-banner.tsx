"use client";

import { useSyncExternalStore } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";

function subscribe(cb: () => void) {
  return () => {};
}

function useIsMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function NetworkBanner() {
  const mounted = useIsMounted();
  const { isOnline, justReconnected } = useNetworkStatus();

  if (!mounted) return null;

  if (!isOnline) {
    return (
      <div className="fixed left-0 right-0 top-0 z-40 pt-safe pointer-events-none">
        <div className="pointer-events-auto bg-red-600 px-4 py-2 text-center text-xs font-medium text-white">
          Нет подключения к интернету
        </div>
      </div>
    );
  }

  if (justReconnected) {
    return (
      <div className="fixed left-0 right-0 top-0 z-40 pt-safe pointer-events-none">
        <div className="pointer-events-auto bg-emerald-600 px-4 py-2 text-center text-xs font-medium text-white">
          Соединение восстановлено
        </div>
      </div>
    );
  }

  return null;
}