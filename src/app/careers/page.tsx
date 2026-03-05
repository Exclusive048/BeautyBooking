import type { Metadata } from "next";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  title: UI_TEXT.pages.careers.title,
  description: UI_TEXT.pages.careers.description,
};

export default function CareersPage() {
  return (
    <main className="mx-auto max-w-[800px] px-4 py-12 md:py-20 space-y-12">

      {/* Hero */}
      <section className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          {UI_TEXT.pages.careers.heroBadge}
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          {UI_TEXT.pages.careers.heroTitle}
        </h1>
        <p className="text-text-sec text-lg max-w-[500px]">
          {UI_TEXT.pages.careers.heroSubtitle}
        </p>
      </section>

      {/* No openings */}
      <div className="lux-card rounded-[24px] bg-bg-card p-10 text-center space-y-4">
        <div className="text-4xl">👀</div>
        <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.careers.emptyTitle}</h2>
        <p className="text-text-sec text-sm max-w-[380px] mx-auto leading-relaxed">
          {UI_TEXT.pages.careers.emptySubtitle}
        </p>
        <a
          href="mailto:jobs@МастерРядом.ru"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-bg-input px-6 text-sm font-semibold text-text-main hover:bg-bg-card transition-colors"
        >
          {UI_TEXT.pages.careers.emptyCta}
        </a>
      </div>

      {/* Culture */}
      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.careers.cultureTitle}</h2>
        <div className="grid gap-3">
          {UI_TEXT.pages.careers.cultureItems.map(([icon, title, desc]) => (
            <div key={title as string} className="flex gap-4 items-start lux-card rounded-[16px] bg-bg-card p-5">
              <span className="text-xl shrink-0">{icon}</span>
              <div>
                <p className="font-semibold text-text-main text-sm">{title}</p>
                <p className="text-text-sec text-sm leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

