"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "pwa-prompt-dismissed";
const VISITS_KEY = "pwa-visits";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function isIOSDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function trackInstallEvent() {
  const anyWindow = window as Window & { trackEvent?: (name: string) => void };
  if (typeof anyWindow.trackEvent === "function") {
    anyWindow.trackEvent("pwa_installed");
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.info("pwa_installed");
  }
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 13v6h14v-6" />
    </svg>
  );
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    const dismissTs = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
    return dismissTs && Date.now() - dismissTs < DISMISS_DURATION_MS;
  });
  const [ios] = useState(() => isIOSDevice());
  const [standalone] = useState(() => isStandaloneMode());

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (standalone) return;

    if (dismissed) return;

    const visits = Number(window.localStorage.getItem(VISITS_KEY) ?? "0") + 1;
    window.localStorage.setItem(VISITS_KEY, String(visits));
    const delay = visits >= 2 ? 5000 : 30000;
    const timer = window.setTimeout(() => setVisible(true), delay);

    return () => window.clearTimeout(timer);
  }, [dismissed, standalone]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (process.env.NODE_ENV !== "production" || dismissed || standalone || !visible) return null;

  const canShow = ios || deferredPrompt;
  if (!canShow) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 pb-safe">
      <div className="rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 shadow-card">
        <div className="text-sm font-semibold text-text-main">Установить МастерРядом</div>
        {ios ? (
          <div className="mt-1 text-xs text-text-sec">
            Нажмите <span className="inline-flex items-center gap-1 font-medium text-text-main"><ShareIcon />Поделиться</span> и выберите «На экран Домой».
          </div>
        ) : (
          <div className="mt-1 text-xs text-text-sec">Добавьте приложение на главный экран для быстрого доступа.</div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={dismiss}>
            Позже
          </Button>
          {!ios ? (
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                if (!deferredPrompt) return;
                await deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice.catch(() => null);
                if (choice?.outcome === "accepted") {
                  trackInstallEvent();
                }
                dismiss();
                setDeferredPrompt(null);
              }}
            >
              Установить
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

