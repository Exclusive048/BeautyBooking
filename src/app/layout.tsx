import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ViewerTimeZoneProvider } from "@/components/providers/viewer-timezone-provider";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "BeautyHub",
  description: "Запись к мастерам",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ViewerTimeZoneProvider>
            <AppShell>{children}</AppShell>
          </ViewerTimeZoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
