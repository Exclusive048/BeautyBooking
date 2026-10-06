import "@/lib/startup";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});
import { AppShell } from "@/components/layout/app-shell";
import { ViewerTimeZoneProvider } from "@/components/providers/viewer-timezone-provider";
import { ThemeColorMeta } from "@/components/theme-color-meta";
import { ThemeProvider } from "@/components/theme-provider";
import { NetworkBanner } from "@/components/ui/network-banner";
import { PWAUpdatePrompt } from "@/components/pwa/update-prompt";
import { PWAInstallPrompt } from "@/components/pwa/install-prompt";
import { DevServiceWorkerReset } from "@/components/pwa/dev-sw-reset";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ToastProvider } from "@/components/ui/toast";
import { WelcomeGate } from "@/components/onboarding/welcome-gate";
import { CookieNotice } from "@/components/layout/cookie-notice";
import { PushManager } from "@/components/pwa/push-manager";
import { SWRProvider } from "@/components/providers/swr-provider";
import { MotionProvider } from "@/components/providers/motion-provider";
import { resolveAuthMethods } from "@/lib/auth/auth-methods";
import { getRefreshCookieName } from "@/lib/auth/session";
import { getNonce } from "@/lib/csp/nonce";
import { resolveViewport } from "@/lib/pwa/viewport";
import { COOKIE_NOTICE_COOKIE, hasAcknowledgedCookieNotice } from "@/lib/legal/cookie-notice";
import * as UI_TEXT from "@/lib/ui/text";
import { ensureVisualSearchStartupConfig } from "@/lib/visual-search/config";
import { env } from "@/lib/env";
import { safeJsonLd } from "@/lib/seo/schema";
import { SITE_ICONS } from "@/lib/seo/site-icons";
import { APPLE_STARTUP_IMAGES } from "@/lib/pwa/apple-splash";

ensureVisualSearchStartupConfig();

const LOCAL_SW_RESET_SCRIPT = `
(() => {
  try {
    const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalHost || !("serviceWorker" in navigator)) return;
    const resetDoneKey = "__local_sw_reset_done__";
    const reloadDoneKey = "__local_sw_reset_reloaded__";
    if (window.sessionStorage.getItem(resetDoneKey) === "1") return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    window.sessionStorage.setItem(resetDoneKey, "1");

    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => {
        if (!("caches" in window)) return;
        return window.caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))));
      })
      .then(() => {
        if (!hadController || window.sessionStorage.getItem(reloadDoneKey) === "1") return;
        window.sessionStorage.setItem(reloadDoneKey, "1");
        window.location.reload();
      })
      .catch(() => null);
  } catch {
    // no-op
  }
})();
`;

// FIX-EXP-A11Y-PWA (EXP-033): никому не ставится `userScalable: false` — он
// запрещает щипок (WCAG 1.4.4). PWA-ZOOM-01: iOS получает `maximumScale: 1`,
// который гасит автоприближение полей ввода, но не щипок — `lib/pwa/viewport.ts`.
// Layout и так динамический (nonce читает заголовки), поэтому чтение UA ничего
// не меняет в режиме рендера.
export async function generateViewport(): Promise<Viewport> {
  return resolveViewport((await headers()).get("user-agent"));
}

// `||`, а не `??`: пустая строка в env — тоже «не задано».
const SITE_URL = (env.NEXT_PUBLIC_APP_URL || "https://masterryadom.ru").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // SEO-01: подтверждение прав в Яндекс Вебмастере и Google Search Console —
  // мета-тег появляется, только когда код задан в env.
  verification: {
    ...(env.GOOGLE_SITE_VERIFICATION ? { google: env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(env.YANDEX_SITE_VERIFICATION ? { yandex: env.YANDEX_SITE_VERIFICATION } : {}),
  },
  title: {
    default: UI_TEXT.meta.title,
    template: `%s | ${UI_TEXT.brand.name}`,
  },
  description: UI_TEXT.meta.description,
  keywords: [
    "запись к мастеру",
    "онлайн запись красота",
    "маникюр запись",
    "стрижки онлайн",
    "мастер красоты рядом",
    "салон красоты",
    "массаж запись",
    "бьюти мастер",
  ],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: UI_TEXT.brand.name,
    title: UI_TEXT.meta.title,
    description: UI_TEXT.meta.description,
    images: [{ url: "/brand/og-mark.png", width: 1200, height: 1200, alt: UI_TEXT.brand.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: UI_TEXT.meta.title,
    description: UI_TEXT.meta.description,
  },
  // brand-kit: PWA manifest + icons served from `/brand/`. The orphan
  // off-brand `public/manifest.json` (theme_color #c6a97e) was deleted in
  // FIX-EXP-A11Y-PWA (EXP-032) — only this `/brand/manifest.webmanifest` is
  // linked. Legacy `/icons/*` were removed with the BRAND-ICONS-02 icon set.
  manifest: "/brand/manifest.webmanifest",
  icons: SITE_ICONS,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: UI_TEXT.brand.name,
    // PWA-SPLASH-01: список и файлы — `lib/pwa/apple-splash.ts` + `public/splash/`.
    startupImage: [...APPLE_STARTUP_IMAGES],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
};

/**
 * SEO-01: разметка сайта для поисковиков — организация (логотип и название в
 * выдаче) и сайт с поиском по каталогу (строка поиска прямо в результатах).
 * Адрес — из env, а не литерал: на стенде с другим доменом разметка не
 * указывает на чужой сайт.
 */
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: UI_TEXT.brand.name,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/icon-512.png`,
      ...(env.NEXT_PUBLIC_VK_COMMUNITY_URL ? { sameAs: [env.NEXT_PUBLIC_VK_COMMUNITY_URL] } : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: UI_TEXT.brand.name,
      url: SITE_URL,
      description: UI_TEXT.meta.description,
      inLanguage: "ru",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/catalog?serviceQuery={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = await getNonce();
  // AUTH-GATE-01: the guest bottom-nav «Войти» tab follows the same
  // server-resolved availability as the topbar CTAs.
  const { any: authEnabled } = await resolveAuthMethods();
  // SESSION-PWA-GUEST-FLASH: у браузера есть кука обновления сессии — значит,
  // скорее всего, человек вошёл. Нижняя навигация не рисует гостя, пока
  // `/api/me` не ответил или упал. Подсказка, а не право: доступ решает сервер.
  const sessionHint = (await cookies()).has(getRefreshCookieName());
  // RKN-FIX-06: the cookie notice is suppressed SERVER-side for visitors who
  // already acknowledged it, so its markup never reaches them and there is no
  // hydration flash. Free of cost here — this layout is already dynamic
  // (`getNonce()` reads headers), so reading a cookie adds no rendering mode change.
  const cookieNoticeAcknowledged = hasAcknowledgedCookieNotice(
    (await cookies()).get(COOKIE_NOTICE_COOKIE)?.value,
  );
  return (
    <html lang="ru" className={playfair.variable} suppressHydrationWarning>
      <head>
        <meta property="csp-nonce" content={nonce} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LOCAL_SW_RESET_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(SITE_JSON_LD) }}
        />
      </head>
      <body>
        <SWRProvider>
        <MotionProvider>
        <ThemeProvider nonce={nonce}>
          <ViewerTimeZoneProvider>
            <ThemeColorMeta />
            <DevServiceWorkerReset />
            <NetworkBanner />
            <PWAUpdatePrompt />
            <PWAInstallPrompt />
            {/* Короткие сообщения — выше границы навигации (переживают router.refresh
                и переход между кабинетами); область рендерится после BottomNav. */}
            <ToastProvider>
              <AppShell>{children}</AppShell>
              <BottomNav authEnabled={authEnabled} sessionHint={sessionHint} />
              {/* WELCOME-DIALOG-01: приветствие этапа тестирования, один раз. */}
              <WelcomeGate />
            </ToastProvider>
            {cookieNoticeAcknowledged ? null : <CookieNotice />}
            <PushManager />
          </ViewerTimeZoneProvider>
        </ThemeProvider>
        </MotionProvider>
        </SWRProvider>
      </body>
    </html>
  );
}

