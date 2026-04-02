"use client";

import { UI_TEXT } from "@/lib/ui/text";

export function MobileBookingCta() {
  function scrollToBooking() {
    const el = document.getElementById("booking");
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-4 mb-4">
        <button
          type="button"
          onClick={scrollToBooking}
          className="w-full rounded-2xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-6 py-4 text-base font-semibold text-[rgb(var(--accent-foreground))] shadow-hover transition active:scale-[0.98]"
        >
          {UI_TEXT.publicProfile.page.bookNow}
        </button>
      </div>
    </div>
  );
}
