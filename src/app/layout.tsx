import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ViewerTimeZoneProvider } from "@/components/providers/viewer-timezone-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { NetworkBanner } from "@/components/ui/network-banner";
import { PWAUpdatePrompt } from "@/components/pwa/update-prompt";
import { PWAInstallPrompt } from "@/components/pwa/install-prompt";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getNonce } from "@/lib/csp/nonce";
import { UI_TEXT } from "@/lib/ui/text";
import { ensureVisualSearchStartupConfig } from "@/lib/visual-search/config";

ensureVisualSearchStartupConfig();

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
      </head>
      <body>
        <ThemeProvider>
          <ViewerTimeZoneProvider>
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

