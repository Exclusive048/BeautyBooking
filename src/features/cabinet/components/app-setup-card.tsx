"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bell, Check, Download, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Switch } from "@/components/ui/switch";
import { usePushOptIn } from "@/features/cabinet/hooks/use-push-opt-in";
import { cn } from "@/lib/cn";
import { promptPwaInstall, type PwaPlatform } from "@/lib/pwa/install-state";
import { usePwaInstall } from "@/lib/pwa/use-pwa-install";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.pwa.onboarding;
const PUSH = UI_TEXT.settings.notifications.push;
const DISMISS_KEY = "app-setup-dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(DISMISS_KEY));
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // localStorage недоступен (приватный режим) — карточка просто вернётся.
  }
}

function StepMarker({ index, done }: { index: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        done
          ? "border-success-border bg-success-surface text-success-text"
          : "border-primary/30 bg-primary/10 text-accent-text",
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : index}
    </span>
  );
}

type Props = {
  /**
   * `dashboard` — карточка на главной кабинета: её можно скрыть, и она уходит
   * сама, когда приложение установлено и уведомления включены.
   * `settings` — постоянный блок в настройках (здесь же выключают уведомления).
   */
  variant?: "dashboard" | "settings";
  className?: string;
};

/**
 * PWA-ONBOARDING-01 — «Приложение и уведомления»: как установить МастерРядом
 * на устройство (нативная кнопка там, где браузер её даёт, и пошаговая
 * инструкция для iPhone / Android / компьютера) и, рядом, включение push.
 *
 * Порядок шагов не случаен: на iPhone web-push работает ТОЛЬКО в
 * установленном приложении, поэтому там тумблер уведомлений до установки
 * заменён объяснением, а не отказом браузера без причины.
 */
export function AppSetupCard({ variant = "dashboard", className }: Props) {
  const install = usePwaInstall();
  const push = usePushOptIn();
  const reduce = useReducedMotion();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [platform, setPlatform] = useState<PwaPlatform | null>(null);
  const [installing, setInstalling] = useState(false);

  if (push.loading) return null;

  const pushDone = push.enabled && push.permission === "granted";
  const complete = install.installed && pushDone;
  if (variant === "dashboard" && (dismissed || complete)) return null;

  const shownPlatform = platform ?? install.platform;
  const iosBeforeInstall = install.platform === "ios" && !install.installed;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await promptPwaInstall();
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <motion.section
      aria-labelledby="app-setup-title"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      <Card className="p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Smartphone className="h-5 w-5 text-accent-text" strokeWidth={1.5} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent-text">{T.eyebrow}</p>
            <h2 id="app-setup-title" className="mt-1 font-display text-xl text-text-main">
              {T.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-sec">{T.subtitle}</p>
          </div>
          {variant === "dashboard" ? (
            <Button variant="ghost" size="sm" onClick={handleDismiss} className="shrink-0 text-text-sec">
              {T.hide}
            </Button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* Шаг 1 — установка */}
          <div className="rounded-2xl border border-border-subtle bg-bg-input/40 p-4">
            <div className="flex items-start gap-3">
              <StepMarker index={1} done={install.installed} />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-main">{T.installStep.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-text-sec">{T.installStep.desc}</p>
              </div>
            </div>

            {install.installed ? (
              <Badge variant="success" className="mt-3">
                {T.installStep.installed}
              </Badge>
            ) : (
              <div className="mt-3 space-y-3">
                {install.canPrompt ? (
                  <Button size="sm" onClick={() => void handleInstall()} disabled={installing}>
                    <Download className="mr-1.5 h-4 w-4" strokeWidth={1.5} aria-hidden />
                    {T.installStep.installCta}
                  </Button>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-medium text-text-main">{T.installStep.manualTitle}</p>
                  <SegmentedTabs<PwaPlatform>
                    value={shownPlatform}
                    onChange={setPlatform}
                    ariaLabel={T.installStep.platformsLabel}
                    options={[
                      { value: "ios", label: T.installStep.platforms.ios },
                      { value: "android", label: T.installStep.platforms.android },
                      { value: "desktop", label: T.installStep.platforms.desktop },
                    ]}
                  />
                  <ol className="mt-3 space-y-1.5">
                    {T.installStep.steps[shownPlatform].map((step, index) => (
                      <li key={step} className="flex gap-2 text-xs leading-relaxed text-text-sec">
                        <span className="w-4 shrink-0 font-semibold text-text-main">{index + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>

          {/* Шаг 2 — уведомления */}
          <div className="rounded-2xl border border-border-subtle bg-bg-input/40 p-4">
            <div className="flex items-start gap-3">
              <StepMarker index={2} done={pushDone} />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-main">{T.pushStep.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-text-sec">{T.pushStep.desc}</p>
              </div>
            </div>

            <div className="mt-3">
              {iosBeforeInstall ? (
                <p className="text-xs leading-relaxed text-text-sec">{T.pushStep.iosNeedsInstall}</p>
              ) : push.permission === "unsupported" ? (
                <p className="text-xs leading-relaxed text-text-sec">{PUSH.unsupported}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-text-main">
                      <Bell className="h-4 w-4 text-text-sec" strokeWidth={1.5} aria-hidden />
                      {pushDone ? T.pushStep.enabled : T.pushStep.toggle}
                    </span>
                    <Switch
                      checked={pushDone}
                      disabled={push.toggling}
                      onCheckedChange={(next) => void push.toggle(next)}
                      aria-label={T.pushStep.toggle}
                    />
                  </div>
                  {!push.enabled && push.permission === "default" ? (
                    <p className="mt-2 text-xs text-text-sec">{PUSH.permissionPrompt}</p>
                  ) : null}
                  {push.permission === "denied" ? (
                    <p className="mt-2 text-xs text-text-sec">{PUSH.denied}</p>
                  ) : null}
                </>
              )}

              {push.error ? (
                <p role="alert" className="mt-2 text-xs text-danger-text">
                  {push.error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </motion.section>
  );
}
