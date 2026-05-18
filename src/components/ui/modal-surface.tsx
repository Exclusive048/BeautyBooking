"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

export type ModalSurfaceSize = "sm" | "md" | "lg" | "xl" | "full";

export type ModalSurfaceHeader = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Plain-string title. Preserved for the ~79 existing callers — renders
   * as the modal heading. For richer headers (subtitle / icon) pass
   * `header` instead. If both are provided, `header.title` wins.
   */
  title?: string;
  /**
   * Optional rich header: `{ title, subtitle?, icon? }`. New API
   * (MODAL-UNIFY-IMPL-A). Sets `aria-labelledby` automatically.
   */
  header?: ModalSurfaceHeader;
  /**
   * Optional footer slot rendered below children. New API.
   */
  footer?: ReactNode;
  /**
   * Modal width. Default `lg` = the original `max-w-2xl` behaviour
   * so existing callers keep their layout. Use `className` to
   * override entirely if a non-standard width is needed.
   */
  size?: ModalSurfaceSize;
  children: ReactNode;
  className?: string;
};

const isBrowser = typeof document !== "undefined";

const SIZE_CLASS: Record<ModalSurfaceSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-7xl",
};

/**
 * Centered modal with backdrop click-to-close.
 *
 * modals-investigation: ModalSurface renders through
 * `createPortal(..., document.body)` so the `fixed inset-0` always
 * anchors to the **viewport**, regardless of any ancestor CSS that
 * might otherwise establish a containing block (`transform`,
 * `filter`, `backdrop-filter`, `contain`, etc.). This is the
 * canonical fix after three recurrences of the "modal top clipped
 * above viewport" bug in Services / Portfolio modals — see
 * BACKLOG.md for the diagnostic story.
 *
 * MODAL-UNIFY-IMPL-A: extended with `size`, `header`, `footer`
 * slots and a framer-motion entrance/exit animation (fade + scale).
 * All additions are opt-in — passing only the original
 * `{open, onClose, title?, className?, children}` produces the
 * identical layout the ~79 existing callers rely on.
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
export function ModalSurface({
  open,
  onClose,
  title,
  header,
  footer,
  size = "lg",
  children,
  className,
}: Props) {
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

  if (!isBrowser) return null;

  const headerTitle = header?.title ?? title ?? null;
  const ariaLabelledBy = headerTitle ? titleId : undefined;

  const node = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
            <motion.section
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "relative my-6 w-full rounded-[24px] border border-border-subtle bg-bg-card p-5 shadow-hover",
                SIZE_CLASS[size],
                className,
              )}
            >
              {header ? (
                <header className="mb-4 flex items-start gap-3">
                  {header.icon ? (
                    <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {header.icon}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h3
                      id={titleId}
                      className="font-display text-lg font-semibold text-text-main"
                    >
                      {header.title}
                    </h3>
                    {header.subtitle ? (
                      <p className="mt-1 text-sm text-text-sec">{header.subtitle}</p>
                    ) : null}
                  </div>
                </header>
              ) : title ? (
                <h3
                  id={titleId}
                  className="mb-3 text-base font-semibold text-text-main"
                >
                  {title}
                </h3>
              ) : null}
              {children}
              {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
            </motion.section>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(node, document.body);
}
