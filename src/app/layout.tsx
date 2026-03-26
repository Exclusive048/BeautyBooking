import "@/lib/startup";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ViewerTimeZoneProvider } from "@/components/providers/viewer-timezone-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { NetworkBanner } from "@/components/ui/network-banner";
import { PWAUpdatePrompt } from "@/components/pwa/update-prompt";
import { PWAInstallPrompt } from "@/components/pwa/install-prompt";
import { DevServiceWorkerReset } from "@/components/pwa/dev-sw-reset";
import { BottomNav } from "@/components/layout/bottom-nav";
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
  title: UI_TEXT.meta.title,
  description: UI_TEXT.meta.description,
  manifest: "/manifest.json",
  icons: {
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = await getNonce();
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta property="csp-nonce" content={nonce} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LOCAL_SW_RESET_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <ViewerTimeZoneProvider>
            <DevServiceWorkerReset />
            <NetworkBanner />
            <PWAUpdatePrompt />
            <PWAInstallPrompt />
            <AppShell>{children}</AppShell>
            <BottomNav />
          </ViewerTimeZoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

