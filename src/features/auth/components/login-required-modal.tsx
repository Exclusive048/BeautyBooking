"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  onClose: () => void;
};

const T = UI_TEXT.catalog2.loginRequired;

/**
 * Modal shown when an anonymous visitor tries to favorite a master. Built as
 * a generic component so future "save action requires login" surfaces (e.g.
 * notifications opt-in, gift-card purchase) can reuse it.
 *
 * The `?next=` redirect is computed via `usePathname()` + `useSearchParams()`
 * rather than `window.location` so the component is safe under SSR / RSC.
 */
export function LoginRequiredModal({ open, onClose }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC-to-close — modal pattern parity with MobileFilterDrawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const queryString = searchParams.toString();
  const nextHref = queryString ? `${pathname}?${queryString}` : pathname;
  const loginHref = `/login?next=${encodeURIComponent(nextHref)}`;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={T.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border-subtle bg-bg-card p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={T.closeCta}
          className="absolute right-3 top-3 rounded-md p-1.5 text-text-sec transition-colors hover:bg-bg-input hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Heart className="h-6 w-6" aria-hidden />
        </div>

        <h3 className="mb-2 text-center font-display text-xl text-text-main">{T.title}</h3>
        <p className="mb-6 text-center leading-relaxed text-text-sec">{T.description}</p>

        <div className="flex gap-3">
          <Button asChild variant="primary" className="flex-1">
            <Link href={loginHref}>{T.loginCta}</Link>
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {T.closeCta}
          </Button>
        </div>
      </div>
    </div>
  );
}
