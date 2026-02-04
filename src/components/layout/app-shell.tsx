import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg-page [--topbar-h:72px]">
      <Topbar />
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">{children}</main>
      <Footer />
    </div>
  );
}
