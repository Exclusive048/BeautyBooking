"use client";

import { useEffect } from "react";

const RESET_DONE_KEY = "__dev_sw_reset_done__";
const RELOAD_DONE_KEY = "__dev_sw_reset_reloaded__";

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalHost) return;
    if (!("serviceWorker" in navigator)) return;
    if (window.sessionStorage.getItem(RESET_DONE_KEY) === "1") return;

    void (async () => {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }

      window.sessionStorage.setItem(RESET_DONE_KEY, "1");

      if (hadController && window.sessionStorage.getItem(RELOAD_DONE_KEY) !== "1") {
        window.sessionStorage.setItem(RELOAD_DONE_KEY, "1");
        window.location.reload();
      }
    })().catch(() => null);
  }, []);

  return null;
}
