"use client";

import { scrollBehavior } from "@/lib/ui/scroll";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

export const BOOKING_OPEN_SHEET_EVENT = "booking:open-sheet";

export function MobileBookingCta() {
  function handleClick() {
    // Notify BookingSectionClient to open the bottom sheet
    document.dispatchEvent(new CustomEvent(BOOKING_OPEN_SHEET_EVENT));
    // Scroll fallback in case the section hasn't loaded yet
    const el = document.getElementById("booking");
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top: y, behavior: scrollBehavior() });
    }
  }

  // PUBLIC-PROFILE-FIXED-CTA-UNDER-BOTTOM-NAV (2026-09-24): кнопка стоит НАД
  // глобальной нижней навигацией (`--bottom-nav-h` публикует `BottomTabBar`),
  // а не под ней: навигация — `z-40`, и раньше перекрывала половину кнопки, так
  // что тап по её центру попадал во вкладку. Запасное значение — та же формула
  // высоты панели, что у `BottomTabBarSpacer`: до гидратации кнопка не прыгает.
  // Safe-area забирает сама панель, поэтому своего отступа здесь нет.
  return (
    <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h,calc(3rem+max(0px,calc(env(safe-area-inset-bottom,0px)-10px))))] z-float lg:hidden">
      <div className="mx-4 mb-3">
        <Button
          variant="primary"
          size="lg"
          onClick={handleClick}
          className="h-14 w-full px-6 font-semibold shadow-hover motion-reduce:active:scale-100"
        >
          {UI_TEXT.publicProfile.page.bookNow}
        </Button>
      </div>
    </div>
  );
}
