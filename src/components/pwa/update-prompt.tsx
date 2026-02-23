"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function PWAUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let mounted = true;

    const handleRegistration = (reg: ServiceWorkerRegistration | undefined) => {
      if (!reg) return;
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
        setVisible(true);
      }

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(installing);
            setVisible(true);
          }
        });
      });
    };

    navigator.serviceWorker.getRegistration().then(handleRegistration).catch(() => null);

    const handleControllerChange = () => {
      if (!mounted) return;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (process.env.NODE_ENV !== "production" || !visible) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-50 pt-safe">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 shadow-card">
        <div className="text-sm text-text-main">Доступно обновление приложения</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setVisible(false)}
          >
            Позже
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (waitingWorker) {
                waitingWorker.postMessage({ type: "SKIP_WAITING" });
              }
              window.location.reload();
            }}
          >
            Обновить
          </Button>
        </div>
      </div>
    </div>
  );
}
