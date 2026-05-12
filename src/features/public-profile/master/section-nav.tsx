"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Info, List, Star } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type SectionId = "services" | "portfolio" | "reviews" | "about";

const T = UI_TEXT.publicProfile.tabs;

const SECTIONS: Array<{ id: SectionId; label: string; Icon: typeof List }> = [
  { id: "services", label: T.services, Icon: List },
  { id: "portfolio", label: T.portfolio, Icon: ImageIcon },
  { id: "reviews", label: T.reviews, Icon: Star },
  { id: "about", label: T.about, Icon: Info },
];

/**
 * Sticky in-page tab bar with IntersectionObserver-driven active state.
 * Each tab anchor-scrolls to its sibling section; the underline tracks
 * which section currently dominates the viewport. Snap-x scroll on
 * mobile keeps tabs aligned when horizontally overflowing.
 */
export function SectionNav() {
  const [active, setActive] = useState<SectionId>("services");
  const observersRef = useRef<Map<SectionId, IntersectionObserver>>(new Map());

  useEffect(() => {
    const observers = observersRef.current;
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(id);
        },
        { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.set(id, obs);
    });
    return () => {
      observers.forEach((obs) => obs.disconnect());
      observers.clear();
    };
  }, []);

  function scrollTo(id: SectionId) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border-subtle bg-bg-page/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <div className="scrollbar-hide flex min-w-max snap-x snap-mandatory gap-1 overflow-x-auto py-1">
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className={`relative inline-flex shrink-0 snap-start items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors duration-200 md:px-4 ${
                isActive ? "text-text-main" : "text-text-sec hover:text-text-main"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={1.6} />
              {label}
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
