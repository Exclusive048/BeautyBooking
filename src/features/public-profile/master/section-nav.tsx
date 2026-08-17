"use client";

import { useEffect, useRef, useState } from "react";
import { scrollBehavior } from "@/lib/ui/scroll";
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
 * which section currently dominates the viewport.
 *
 * FIX-D2 (PUBLIC-PROFILE-MOBILE-OVERFLOW). Полоса ОБЯЗАНА прокручиваться
 * сама, а не расширять страницу, и у этого требования две половины,
 * которые нельзя ставить на один элемент:
 *
 *  • скролл-контейнер — обёртка (`overflow-x-auto`), она же bleed до краёв
 *    (`-mx-4 px-4`), чтобы вкладки уезжали под гаттер страницы, а не
 *    обрезались на 16 px от края; `scroll-px-*` повторяет `px-*`, иначе
 *    snap-start прижимает вкладку к самому краю экрана и гаттер исчезает;
 *  • дорожка — `flex min-w-max`: она шире контейнера, и именно её ширина
 *    и есть то, что контейнер прокручивает.
 *
 * До фикса `min-w-max` и `overflow-x-auto` стояли на ОДНОМ элементе:
 * элемент не может стать у́же своего содержимого, значит содержимое из него
 * не выпадает и прокручивать нечего — `scrollWidth == clientWidth` у
 * полосы, а лишние 84 px уезжали в документ (`documentElement.scrollWidth`
 * 459 при 375). На телефоне это не «страница скроллится вбок»: мобильный
 * layout-viewport растягивается до ширины содержимого (459×994 при экране
 * 375×812), и всё, что стоит `fixed bottom-0`, — CTA «Записаться» и нижняя
 * навигация — оказывается ЗА нижней кромкой экрана, а `window.scrollX`
 * остаётся 0 (поэтому проба SMOKE-01 сочла это ложным срабатыванием).
 * Замер — `.qa/diagnostics/fix-d2/`. Тот же split уже несут
 * `clients-tabs` / `notifications-tabs` / `filter-chips` / карусели —
 * это единственная полоса проекта, где половины были склеены.
 */
export function SectionNav() {
  const [active, setActive] = useState<SectionId>("services");
  const observersRef = useRef<Map<SectionId, IntersectionObserver>>(new Map());
  const scrollerRef = useRef<HTMLDivElement | null>(null);

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

  // Полоса теперь реально прокручивается, поэтому активная вкладка может
  // оказаться за её краем (пользователь долистал до «О мастере»). Двигаем
  // ТОЛЬКО полосу — не `scrollIntoView`, который прокрутил бы и окно, —
  // и только если вкладка не видна целиком.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const tab = scroller.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!tab) return;
    const box = scroller.getBoundingClientRect();
    const rect = tab.getBoundingClientRect();
    if (rect.left >= box.left && rect.right <= box.right) return;
    const left = rect.left - box.left + scroller.scrollLeft;
    scroller.scrollTo({ left, behavior: scrollBehavior() });
  }, [active]);

  function scrollTo(id: SectionId) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: scrollBehavior() });
  }

  return (
    <div
      ref={scrollerRef}
      className="scrollbar-hide sticky top-0 z-20 -mx-4 snap-x overflow-x-auto border-b border-border-subtle bg-bg-page/90 px-4 scroll-px-4 backdrop-blur-md sm:-mx-6 sm:px-6 sm:scroll-px-6 lg:mx-0 lg:px-0 lg:scroll-px-0"
    >
      <div className="flex min-w-max gap-1 py-1">
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              data-section={id}
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
