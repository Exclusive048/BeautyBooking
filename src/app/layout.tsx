import "@/lib/startup";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
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
import { ThemeProvider } from "@/components/theme-provider";
import { NetworkBanner } from "@/components/ui/network-banner";
import { PWAUpdatePrompt } from "@/components/pwa/update-prompt";
import { PWAInstallPrompt } from "@/components/pwa/install-prompt";
import { DevServiceWorkerReset } from "@/components/pwa/dev-sw-reset";
import { BottomNav } from "@/components/layout/bottom-nav";
import { CookieNotice } from "@/components/layout/cookie-notice";
import { PushManager } from "@/components/pwa/push-manager";
import { SWRProvider } from "@/components/providers/swr-provider";
import { resolveAuthMethods } from "@/lib/auth/auth-methods";
import { getNonce } from "@/lib/csp/nonce";
import { COOKIE_NOTICE_COOKIE, hasAcknowledgedCookieNotice } from "@/lib/legal/cookie-notice";
import { UI_TEXT } from "@/lib/ui/text";
import { ensureVisualSearchStartupConfig } from "@/lib/visual-search/config";
import { env } from "@/lib/env";
import { safeJsonLd } from "@/lib/seo/schema";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // FIX-EXP-A11Y-PWA (EXP-033): no `maximumScale`/`userScalable: false` — those
  // block pinch-to-zoom, breaking WCAG 1.4.4 (Resize Text) for low-vision users.
  viewportFit: "cover",
  // brand-kit: mobile browser chrome tint matches the brand palette
  // — `#720808` (brand-deep) in light, `#a10728` (brand-core) in dark.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#720808" },
    { media: "(prefers-color-scheme: dark)", color: "#a10728" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL ?? "https://masterryadom.ru"),
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
    images: [{ url: "/brand/icon-512.png", width: 512, height: 512, alt: UI_TEXT.brand.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: UI_TEXT.meta.title,
    description: UI_TEXT.meta.description,
  },
  // brand-kit: PWA manifest + icons served from `/brand/`. The orphan
  // off-brand `public/manifest.json` (theme_color #c6a97e) was deleted in
  // FIX-EXP-A11Y-PWA (EXP-032) — only this `/brand/manifest.webmanifest` is
  // linked. (Legacy `/icons/*` orphans remain — separate cleanup.)
  manifest: "/brand/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: UI_TEXT.brand.name,
    startupImage: [
      {
        url: "/splash/apple-splash-1290-2796.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/apple-splash-1179-2556.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/apple-splash-1170-2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/apple-splash-750-1334.png",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
};

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "МастерРядом",
  url: "https://masterryadom.ru",
  description: "Маркетплейс онлайн-записи к мастерам красоты",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web, iOS, Android",
  inLanguage: "ru",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "RUB",
    description: "Бесплатная запись для клиентов",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = await getNonce();
  // AUTH-GATE-01: the guest bottom-nav «Войти» tab follows the same
  // server-resolved availability as the topbar CTAs.
  const { any: authEnabled } = await resolveAuthMethods();
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
        <ThemeProvider nonce={nonce}>
          <ViewerTimeZoneProvider>
            <DevServiceWorkerReset />
            <NetworkBanner />
            <PWAUpdatePrompt />
            <PWAInstallPrompt />
            <AppShell>{children}</AppShell>
            <BottomNav authEnabled={authEnabled} />
            {cookieNoticeAcknowledged ? null : <CookieNotice />}
            <PushManager />
          </ViewerTimeZoneProvider>
        </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  );
}

