"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

export type LegalSection = { id: string; title: string };

type Props = {
  title: string;
  /** ISO date "2026-04-28" — formatted in ru-RU on the client */
  lastUpdated: string;
  sections: ReadonlyArray<LegalSection>;
  children: ReactNode;
  /** When true, shows the "Черновик" banner above the title. */
  isDraft?: boolean;
};

export function LegalLayout({ title, lastUpdated, sections, children, isDraft = true }: Props) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  // Scroll-spy: track which section is at the top of the viewport.
  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  return (
    <div>
      {isDraft ? <DraftBanner /> : null}

      <div className="mx-auto w-full max-w-[1280px] px-4 py-8 lg:py-12">
        <header className="mb-8 lg:mb-12">
          <h1 className="mb-2 font-display text-3xl text-text-main lg:text-4xl">{title}</h1>
          <p className="text-sm text-text-sec">
            {UI_TEXT.legal.lastUpdated} {formatDate(lastUpdated)}
          </p>
        </header>

        <div className="grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Desktop ToC */}
          <aside className="hidden lg:block">
            <nav aria-label={UI_TEXT.legal.toc.label} className="sticky top-20 space-y-1">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-label">
                {UI_TEXT.legal.toc.heading}
              </p>
              {sections.map((s, idx) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={[
                    "block rounded-md border-l-2 py-1.5 pl-3 pr-2 text-sm transition-colors",
                    activeId === s.id
                      ? "border-primary bg-muted/40 text-text-main"
                      : "border-transparent text-text-sec hover:text-text-main",
                  ].join(" ")}
                >
                  <span className="mr-2 font-mono text-xs text-text-label/70">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          {/* Mobile ToC */}
          <details className="mb-6 rounded-lg border border-border-subtle p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium text-text-main">
              {UI_TEXT.legal.toc.heading}
            </summary>
            <ul className="mt-3 space-y-1.5">
              {sections.map((s, idx) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-sm text-text-sec hover:text-text-main">
                    {idx + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>

          <article className="legal-prose">{children}</article>
        </div>
      </div>
    </div>
  );
}

function DraftBanner() {
  return (
    <div
      role="note"
      className="border-y border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <div className="mx-auto flex w-full max-w-[1280px] items-start gap-3 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="text-sm">
          <strong className="font-semibold">{UI_TEXT.legal.draft.title}</strong>
          {" — "}
          {UI_TEXT.legal.draft.description}
        </p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
