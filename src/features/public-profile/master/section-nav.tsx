"use client";

import { useEffect, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/ui/text";

type SectionId = "services" | "portfolio" | "reviews";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "services", label: UI_TEXT.publicProfile.page.sectionServices },
  { id: "portfolio", label: UI_TEXT.publicProfile.page.sectionPortfolio },
  { id: "reviews", label: UI_TEXT.publicProfile.page.sectionReviews },
];

export function SectionNav() {
  const [active, setActive] = useState<SectionId>("services");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const observers = new Map<string, IntersectionObserver>();

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(id);
        },
        { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.set(id, obs);
    });

    observerRef.current = null;
    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, []);

  function scrollTo(id: SectionId) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 overflow-x-auto scrollbar-hide bg-bg-page/90 backdrop-blur-md px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <div className="flex min-w-max gap-1 border-b border-border-subtle py-1">
        {SECTIONS.map(({ id, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className={`relative shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? "text-text-main"
                  : "text-text-sec hover:text-text-main"
              }`}
            >
              {label}
              {isActive && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
