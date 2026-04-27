import "@/lib/startup";
import type { Metadata, Viewport } from "next";
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
import { CookieConsent } from "@/components/layout/cookie-consent";
import { PushManager } from "@/components/pwa/push-manager";
import { SWRProvider } from "@/components/providers/swr-provider";
import { getNonce } from "@/lib/csp/nonce";
import { UI_TEXT } from "@/lib/ui/text";
import { ensureVisualSearchStartupConfig } from "@/lib/visual-search/config";

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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://мастеррядом.online"),
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
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: UI_TEXT.brand.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: UI_TEXT.meta.title,
    description: UI_TEXT.meta.description,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
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
  url: "https://мастеррядом.online",
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
  return (
    <html lang="ru" className={playfair.variable} suppressHydrationWarning>
      <head>
        <meta property="csp-nonce" content={nonce} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LOCAL_SW_RESET_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
      </head>
      <body>
        <SWRProvider>
        <ThemeProvider>
          <ViewerTimeZoneProvider>
            <DevServiceWorkerReset />
            <NetworkBanner />
            <PWAUpdatePrompt />
            <PWAInstallPrompt />
            <AppShell>{children}</AppShell>
            <BottomNav />
            <CookieConsent />
            <PushManager />
          </ViewerTimeZoneProvider>
        </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  );
}

