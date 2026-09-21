/**
 * PWA-ONBOARDING-01 — единственный владелец события установки PWA на клиенте.
 *
 * `beforeinstallprompt` приходит ОДИН раз за загрузку страницы, а `prompt()` у
 * пойманного события срабатывает тоже один раз. Раньше событие ловил только
 * плавающий баннер (`PWAInstallPrompt`); вторая поверхность со своим
 * слушателем получила бы либо ничего (событие уже было), либо «мёртвый»
 * prompt. Поэтому событие ловит этот модуль — при первом импорте, то есть уже
 * на загрузке layout'а, — а поверхности читают общее состояние через
 * `useSyncExternalStore`.
 *
 * Client-only: без импорта серверных модулей; на сервере — неизменный снимок.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PwaPlatform = "ios" | "android" | "desktop";

export type PwaInstallSnapshot = {
  /** Страница открыта как установленное приложение (или только что установлена). */
  installed: boolean;
  /** Браузер отдал нативное окно установки — можно показать кнопку «Установить». */
  canPrompt: boolean;
  platform: PwaPlatform;
};

const SERVER_SNAPSHOT: PwaInstallSnapshot = { installed: false, canPrompt: false, platform: "desktop" };

let deferred: BeforeInstallPromptEvent | null = null;
let installedByEvent = false;
let snapshot: PwaInstallSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function detectStandalone(): boolean {
  const media = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

export function detectPlatform(userAgent: string, maxTouchPoints = 0, platform = ""): PwaPlatform {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  // iPadOS 13+ представляется десктопным Safari («Macintosh»), но с тачем.
  if (/macintosh|macintel/i.test(`${userAgent} ${platform}`) && maxTouchPoints > 1) return "ios";
  if (/android/i.test(userAgent)) return "android";
  return "desktop";
}

function recompute() {
  const next: PwaInstallSnapshot = {
    installed: installedByEvent || detectStandalone(),
    canPrompt: deferred !== null,
    platform: detectPlatform(window.navigator.userAgent, window.navigator.maxTouchPoints, window.navigator.platform),
  };
  if (
    next.installed !== snapshot.installed ||
    next.canPrompt !== snapshot.canPrompt ||
    next.platform !== snapshot.platform
  ) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    recompute();
  });
  window.addEventListener("appinstalled", () => {
    installedByEvent = true;
    deferred = null;
    recompute();
  });
  recompute();
}

export function subscribePwaInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaInstallSnapshot(): PwaInstallSnapshot {
  return snapshot;
}

export function getPwaInstallServerSnapshot(): PwaInstallSnapshot {
  return SERVER_SNAPSHOT;
}

/** Показывает нативное окно установки. `true` — пользователь согласился. */
export async function promptPwaInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  recompute();
  await event.prompt();
  const choice = await event.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
}
