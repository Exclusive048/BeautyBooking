"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks/use-me";
import { MOTION, SPRING_SHEET } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { isProduction } from "@/lib/env.client";
import { promptPwaInstall } from "@/lib/pwa/install-state";
import { usePwaInstall } from "@/lib/pwa/use-pwa-install";

const DISMISS_KEY = "pwa-install-dismissed";

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
  // PWA-ONBOARDING-01: событие установки ловит общий стор (`install-state.ts`) —
  // его же читает карточка «Приложение и уведомления»; второй слушатель здесь
  // получил бы то же событие, и второй `prompt()` на нём бросил бы.
  const install = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const ios = install.platform === "ios";

  // Show banner once user is authenticated and conditions are met
  useEffect(() => {
    if (!user) return;
    if (install.installed || readDismissed()) return;
    // On non-iOS we need the browser's native prompt; iOS uses Share sheet
    if (!ios && !install.canPrompt) return;

    const timer = window.setTimeout(() => setVisible(true), 2000);
    return () => window.clearTimeout(timer);
  }, [user, install.installed, ios, install.canPrompt]);

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  const handleInstall = async () => {
    await promptPwaInstall();
    dismiss();
  };

  if (!isProduction) return null;

  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          key="install-banner"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0, transition: MOTION.exit }}
          transition={SPRING_SHEET}
          className="fixed bottom-20 left-3 right-3 z-prompt lg:bottom-6 lg:left-auto lg:right-5 lg:w-80"
        >
          <div className="rounded-2xl border border-border-subtle bg-bg-card px-4 py-3.5 shadow-card backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-primary/10 p-2">
                <Download className="h-5 w-5 text-accent-text" aria-hidden />
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

              {/* UI-26: `ghost` + `size="icon"`. Прежние `p-1` вокруг 16px-иконки
                  давали цель нажатия 24px — вдвое меньше порога WCAG 2.5.5, и это
                  на баннере, который показывается ТОЛЬКО на мобильных/PWA, то есть
                  ровно там, где палец. Отрицательные поля возвращают оптическое
                  выравнивание по краю карточки при выросшем боксе. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={dismiss}
                className="-mr-1.5 -mt-1.5 shrink-0 text-text-sec hover:text-text-main"
                aria-label={UI_TEXT.actions.close}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!ios ? (
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" onClick={handleInstall}>
                  {UI_TEXT.pwa.install.install}
                </Button>
              </div>
            ) : null}
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
