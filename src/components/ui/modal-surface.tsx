"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";

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
  /**
   * MODAL-A11Y-BATCH-A: optional ref for initial focus when the
   * modal opens. Default = first focusable child inside the panel
   * (button / input / etc). Override with this ref to focus a
   * specific element (e.g. the «Confirm» button vs the «Cancel»
   * one). Falls back to the panel container if no focusable found.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
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
  initialFocusRef,
  children,
  className,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  // MODAL-A11Y-BATCH-A: respect OS-level prefers-reduced-motion.
  // framer-motion's useReducedMotion returns true when the user has
  // requested reduced motion. We collapse the entrance/exit to a
  // simple opacity fade and zero scale/translate so vestibular-
  // sensitive users + battery-conscious mobile users get an instant,
  // motion-free open. Default users see the original animation.
  const shouldReduceMotion = useReducedMotion();

  // MODAL-A11Y-BATCH-A + UI-13: весь контракт диалога одним вызовом —
  // Escape, блокировка прокрутки фона, WCAG SC 2.4.3 (Focus Order) и
  // SC 3.2.1 (On Focus). Escape и scroll-lock жили здесь и в `Drawer`
  // дословными копиями; после UI-13 у контракта одна реализация, и
  // оверлеи, написанные мимо примитивов, берут ровно её.
  useOverlayA11y({ open, onClose, containerRef: panelRef, initialFocusRef });

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
          transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
            <motion.section
              ref={panelRef}
              onClick={(event) => event.stopPropagation()}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "relative my-6 w-full rounded-[24px] border border-border-subtle bg-bg-card p-5 shadow-hover",
                SIZE_CLASS[size],
                className,
              )}
              tabIndex={-1}
            >
              {header ? (
                <header className="mb-4 flex items-start gap-3">
                  {header.icon ? (
                    <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent-text">
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
