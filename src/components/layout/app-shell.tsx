import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { CityPromptOverlay } from "@/features/cities/components/city-prompt-overlay";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-bg-page [--topbar-h:72px] flex flex-col">
      <div className="w-full">
        <Topbar />
      </div>
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">{children}</div>
      </main>
      <Footer />
      {/* Single mount point for the first-visit city prompt — the overlay
          itself decides visibility based on cookie + pathname (it hides on
          /admin and /cabinet routes). */}
      <CityPromptOverlay />
    </div>
  );
}
