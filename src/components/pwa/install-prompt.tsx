"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks/use-me";
import { UI_TEXT } from "@/lib/ui/text";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "pwa-install-dismissed";

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  );
  return media || iosStandalone;
}

function isIOSDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function readDismissed(): boolean {
  try {
    return Boolean(localStorage.getItem(DISMISS_KEY));
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // localStorage unavailable
  }
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="inline h-3.5 w-3.5 align-text-top"
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
  const { user } = useMe();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [standalone] = useState(() => isStandaloneMode());
  const [ios] = useState(() => isIOSDevice());

  // Capture beforeinstallprompt before the user interacts
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Show banner once user is authenticated and conditions are met
  useEffect(() => {
    if (!user) return;
    if (standalone || readDismissed()) return;
    // On non-iOS we need the browser's native prompt; iOS uses Share sheet
    if (!ios && !deferredPrompt) return;

    const timer = window.setTimeout(() => setVisible(true), 2000);
    return () => window.clearTimeout(timer);
  }, [user, standalone, ios, deferredPrompt]);

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    dismiss();
    setDeferredPrompt(null);
  };

  if (process.env.NODE_ENV !== "production") return null;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="install-banner"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="fixed bottom-20 left-3 right-3 z-[46] lg:bottom-6 lg:left-auto lg:right-5 lg:w-80"
        >
          <div className="rounded-2xl border border-border-subtle bg-bg-card px-4 py-3.5 shadow-card backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-primary/10 p-2">
                <Download className="h-5 w-5 text-primary" aria-hidden />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-main">
                  {UI_TEXT.pwa.install.title}
                </p>
                {ios ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-text-sec">
                    <ShareIcon /> {UI_TEXT.pwa.install.iosHint}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-text-sec">
                    {UI_TEXT.pwa.install.subtitle}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={dismiss}
                className="shrink-0 rounded-lg p-1 text-text-sec transition-colors hover:text-text-main"
                aria-label={UI_TEXT.actions.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!ios ? (
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" onClick={handleInstall}>
                  {UI_TEXT.pwa.install.install}
                </Button>
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
