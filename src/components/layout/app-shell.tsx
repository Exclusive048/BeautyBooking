import { AppShellContent } from "@/components/layout/app-shell-content";
import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { CityPromptOverlay } from "@/features/cities/components/city-prompt-overlay";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-bg-page [--topbar-h:57px] lg:[--topbar-h:65px] flex flex-col">
      {/* FIX-BATCH-A: `<Topbar>` (the `<header sticky top-0>`) must be a direct
          child of this tall flex-col scroll container. It was previously wrapped
          in a `<div class="w-full">` that shrank to the header's own height, so
          `position:sticky` had zero scroll range and the navbar never stuck on
          any page. `--topbar-h` is reconciled to the real header height
          (h-14+border = 57px, lg:h-16+border = 65px) at this single token source
          so the cabinet page-headers (`top-[var(--topbar-h)]`) sit flush under
          the navbar with no bleed-band. */}
      <Topbar />
      <main className="flex-1 w-full">
        <AppShellContent>{children}</AppShellContent>
      </main>
      <Footer />
      {/* Single mount point for the first-visit city prompt — the overlay
          itself decides visibility based on cookie + pathname (it hides on
          /admin and /cabinet routes). */}
      <CityPromptOverlay />
    </div>
  );
}
