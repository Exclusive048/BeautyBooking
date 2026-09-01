"use client";

import {
  useId,
  useRef,
  type ReactNode,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { cn } from "@/lib/cn";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { UI_TEXT } from "@/lib/ui/text";

export type DrawerSide = "left" | "right" | "bottom";
export type DrawerSize = "sm" | "md" | "lg" | "xl";

type Props = {
  open: boolean;
  onClose: () => void;
  /** "right" (default), "left", or "bottom" (mobile sheet). */
  side?: DrawerSide;
  /** Width for left/right; max height for bottom. Default `md`. */
  size?: DrawerSize;
  /** Optional title rendered in a sticky header bar above children. */
  title?: string;
  /**
   * Optional content rendered on the right side of the header
   * (e.g. extra status badges). The close button is always shown.
   */
  headerActions?: ReactNode;
  /**
   * If `true` and `side="bottom"`, enables touch swipe-down to
   * dismiss with a visible drag handle. Preserves the booking
   * bottom-sheet UX.
   */
  drag?: boolean;
  /** Hide the default close (×) button — caller renders own controls. */
  hideCloseButton?: boolean;
  /**
   * Optional footer slot pinned to the bottom of the drawer
   * (safe-area aware on bottom-sheet variant).
   */
  footer?: ReactNode;
  /** Optional className for the panel surface. */
  className?: string;
  /** Optional aria-label override when no title is set. */
  ariaLabel?: string;
  /**
   * MODAL-A11Y-BATCH-A: optional ref for initial focus when the
   * drawer opens. Default = first focusable child inside the panel.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

const SIDE_SIZE_CLASS: Record<Exclude<DrawerSide, "bottom">, Record<DrawerSize, string>> = {
  right: {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  },
  left: {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  },
};

const BOTTOM_HEIGHT_CLASS: Record<DrawerSize, string> = {
  sm: "max-h-[50dvh]",
  md: "max-h-[75dvh]",
  lg: "max-h-[88dvh]",
  xl: "max-h-[92dvh]",
};

const SHEET_DRAG_THRESHOLD = 60;

/**
 * Unified Drawer primitive (MODAL-UNIFY-IMPL-A). Replaces the five
 * hand-rolled drawers across the codebase
 * (`booking-detail-drawer`, `client-card-drawer`,
 * `master-card-drawer`, `mobile-filter-drawer`,
 * `booking-bottom-sheet`) — each kept its own portal + body
 * scroll-lock + escape + animation + close UI. Those wrappers are
 * preserved as thin shells over this primitive (their public APIs
 * + business logic stay verbatim).
 *
 * Shape:
 *  - `side="right"` / `"left"` — slide-in side panel
 *  - `side="bottom"` — mobile sheet with rounded top + safe-area
 *    aware footer. Set `drag` to enable touch swipe-down dismiss
 *    (preserves booking bottom-sheet UX).
 *
 * Side effects: portal-to-body (same anchoring guarantee as
 * `ModalSurface`), body scroll-lock while open, ESC closes,
 * backdrop click closes. framer-motion entrance/exit (spring for
 * panel, fade for backdrop). Restored on unmount.
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  size = "md",
  title,
  headerActions,
  drag = false,
  hideCloseButton = false,
  footer,
  className,
  ariaLabel,
  initialFocusRef,
  children,
}: Props) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  // MODAL-A11Y-BATCH-A: respect OS prefers-reduced-motion.
  const shouldReduceMotion = useReducedMotion();

  // MODAL-A11Y-BATCH-A + UI-13: контракт диалога целиком (Escape,
  // scroll-lock, WCAG SC 2.4.3 + 3.2.1) — общий с `ModalSurface` и с
  // оверлеями, которые примитивами не оборачиваются.
  useOverlayA11y({ open, onClose, containerRef: sheetRef, initialFocusRef });

  // MODAL-SSR-OPEN-HYDRATION: см. `ModalSurface` — тот же контракт портала.
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;

  const isBottom = side === "bottom";
  const isRight = side === "right";

  const panelMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : isBottom
    ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } }
    : isRight
    ? { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } }
    : { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" } };

  const panelPositionClass = isBottom
    ? cn("inset-x-0 bottom-0 rounded-t-3xl border-t", BOTTOM_HEIGHT_CLASS[size])
    : isRight
    ? cn("inset-y-0 right-0 border-l", SIDE_SIZE_CLASS.right[size], "w-full")
    : cn("inset-y-0 left-0 border-r", SIDE_SIZE_CLASS.left[size], "w-full");

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (!drag || !isBottom) return;
    dragStartY.current = event.touches[0]?.clientY ?? null;
    dragCurrentY.current = 0;
  }
  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    if (!drag || !isBottom || dragStartY.current === null) return;
    dragCurrentY.current = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
  }
  function handleTouchEnd() {
    if (!drag || !isBottom) return;
    if (dragCurrentY.current > SHEET_DRAG_THRESHOLD) {
      onClose();
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  }

  const node = (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="drawer-panel"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={!title ? ariaLabel : undefined}
            {...panelMotion}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : isBottom
                ? { type: "spring", stiffness: 320, damping: 32 }
                : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
            }
            tabIndex={-1}
            className={cn(
              "fixed z-50 flex flex-col border-border-subtle bg-bg-page shadow-2xl",
              panelPositionClass,
              isBottom ? "h-auto" : "h-full",
              className,
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {isBottom && drag ? (
              <div className="flex shrink-0 justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-border" aria-hidden />
              </div>
            ) : null}

            {title || headerActions || !hideCloseButton ? (
              <div
                className={cn(
                  "flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-5",
                  isBottom ? "pb-3 pt-1" : "py-4",
                )}
              >
                <div className="min-w-0 flex-1">
                  {title ? (
                    <h2
                      id={titleId}
                      className="truncate text-base font-semibold text-text-main"
                    >
                      {title}
                    </h2>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {headerActions}
                  {!hideCloseButton ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={onClose}
                      aria-label={UI_TEXT.common.close}
                      className="rounded-xl"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            {footer ? (
              <div
                className={cn(
                  "shrink-0 border-t border-border-subtle px-5 py-3",
                  isBottom ? "pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : "",
                )}
              >
                {footer}
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(node, document.body);
}
