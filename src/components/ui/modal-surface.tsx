"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
};

const isBrowser = typeof document !== "undefined";

/**
 * Centered modal with backdrop click-to-close.
 *
 * modals-investigation: ModalSurface now renders through
 * `createPortal(..., document.body)` so the `fixed inset-0` always
 * anchors to the **viewport**, regardless of any ancestor CSS that
 * might otherwise establish a containing block (`transform`,
 * `filter`, `backdrop-filter`, `contain`, etc.). This is the
 * canonical fix after three recurrences of the "modal top clipped
 * above viewport" bug in Services / Portfolio modals — see
 * BACKLOG.md for the diagnostic story.
 *
 * The two prior audits (fix-02, fix-04a) verified at file-level
 * («does this modal use ModalSurface?» — yes) but not at
 * behaviour-level («does the rendered fixed element actually
 * anchor to the viewport?»). Portalising the wrapper makes the
 * answer to that second question unconditionally yes, regardless
 * of where in the React tree a modal is instantiated.
 *
 * Scroll model: the outer fixed layer carries `overflow-y-auto`
 * itself, so tall modal content scrolls the **whole** modal
 * surface (backdrop included) rather than being trapped in an
 * inner scroll container with a `max-h-[90vh]` cap. On `sm+`
 * viewports the modal centres vertically; on mobile it pins to
 * the top with `my-6` breathing room so the title is always
 * visible on open and the user scrolls from the top down — the
 * standard mobile-modal pattern.
 *
 * Side effects: body scroll lock (`overflow: hidden`) while open
 * prevents the page behind the modal from scrolling. ESC closes.
 * Backdrop click closes — the modal box stops propagation.
 * Restored on unmount or `open → false`.
 */
export function ModalSurface({ open, onClose, title, children, className }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open || !isBrowser) return null;

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50"
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
        <section
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "relative my-6 w-full max-w-2xl rounded-[24px] border border-border-subtle bg-bg-card p-5 shadow-hover",
            className,
          )}
        >
          {title ? (
            <h3
              id={titleId}
              className="mb-3 text-base font-semibold text-text-main"
            >
              {title}
            </h3>
          ) : null}
          {children}
        </section>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
