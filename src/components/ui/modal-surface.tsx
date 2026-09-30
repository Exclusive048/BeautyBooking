"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { DISTANCE, MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

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
   * Закрепить подвал внизу экрана, пока окно длиннее экрана: кнопки шагов
   * длинной формы (часы по дням на телефоне) не уезжают за прокрутку.
   */
  stickyFooter?: boolean;
  /**
   * На телефоне (до `sm`) — во весь экран: шапка с крестиком закреплена
   * сверху, подвал прижат к низу с отступом под «домашнюю полоску»; с `sm`
   * окно прежнее. Для окон, где главное — фото и длинная форма (портфолио).
   */
  fullScreenOnMobile?: boolean;
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
  stickyFooter = false,
  fullScreenOnMobile = false,
  size = "lg",
  initialFocusRef,
  children,
  className,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  // MODAL-A11Y-BATCH-A: prefers-reduced-motion уважается централизованно —
  // `MotionConfig reducedMotion="user"` (MotionProvider) гасит масштаб и сдвиг,
  // оставляя прозрачность (29.09 доработки · 19).

  // MODAL-A11Y-BATCH-A + UI-13: весь контракт диалога одним вызовом —
  // Escape, блокировка прокрутки фона, WCAG SC 2.4.3 (Focus Order) и
  // SC 3.2.1 (On Focus). Escape и scroll-lock жили здесь и в `Drawer`
  // дословными копиями; после UI-13 у контракта одна реализация, и
  // оверлеи, написанные мимо примитивов, берут ровно её.
  useOverlayA11y({ open, onClose, containerRef: panelRef, initialFocusRef });

  // MODAL-SSR-OPEN-HYDRATION: портала нет в серверной разметке, поэтому и
  // первый клиентский рендер обязан отдать `null` — иначе диалог, открытый на
  // первом рендере (`open` из URL), даёт hydration mismatch.
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;

  const headerTitle = header?.title ?? title ?? null;
  const ariaLabelledBy = headerTitle ? titleId : undefined;
  const fullScreen = fullScreenOnMobile;

  const heading = header ? (
    <header className={cn("flex items-start gap-3", !fullScreen && "mb-4")}>
      {header.icon ? (
        <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent-text">
          {header.icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="font-display text-lg font-semibold text-text-main">
          {header.title}
        </h3>
        {header.subtitle ? <p className="mt-1 text-sm text-text-sec">{header.subtitle}</p> : null}
      </div>
    </header>
  ) : title ? (
    <h3 id={titleId} className={cn("text-base font-semibold text-text-main", !fullScreen && "mb-3")}>
      {title}
    </h3>
  ) : null;

  const node = (
    <AnimatePresence>
      {open ? (
        <m.div
          key="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          className="fixed inset-0 z-modal overflow-y-auto bg-black/50"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.micro}
        >
          <div
            className={cn(
              "flex min-h-full items-start justify-center sm:items-center",
              fullScreen ? "sm:p-4" : "p-4",
            )}
          >
            <m.section
              ref={panelRef}
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.97, y: DISTANCE.nudge }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: DISTANCE.nudge, transition: MOTION.exit }}
              transition={MOTION.base}
              className={cn(
                fullScreen
                  ? // Телефон: страница во весь экран, без рамки и скругления;
                    // с `sm` — прежняя карточка.
                    "relative flex min-h-[100dvh] w-full flex-col bg-bg-card px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:my-6 sm:block sm:min-h-0 sm:rounded-[24px] sm:border sm:border-border-subtle sm:p-5 sm:shadow-hover"
                  : "relative my-6 w-full rounded-[24px] border border-border-subtle bg-bg-card p-5 shadow-hover",
                SIZE_CLASS[size],
                className,
              )}
              tabIndex={-1}
              data-fullscreen-mobile={fullScreen || undefined}
            >
              {fullScreen ? (
                <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-start gap-3 border-b border-border-subtle bg-bg-card px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:static sm:mx-0 sm:mb-3 sm:border-b-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
                  <div className="min-w-0 flex-1 pt-2 sm:pt-0">{heading}</div>
                  <Button
                    type="button"
                    variant="icon"
                    size="icon"
                    aria-label={UI_TEXT.common.close}
                    onClick={onClose}
                    className="shrink-0 sm:hidden"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                heading
              )}
              {children}
              {footer ? (
                <div
                  className={cn(
                    "flex justify-end gap-2",
                    fullScreen
                      ? stickyFooter
                        ? // Телефон: подвал прижат к низу экрана и виден при прокрутке.
                          "sticky bottom-0 z-10 -mx-5 mt-auto -mb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] border-t border-border-subtle bg-bg-card px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4 sm:-mb-5 sm:mt-5 sm:rounded-b-[24px] sm:py-4"
                        : "mt-auto pt-5 sm:mt-5 sm:pt-0"
                      : stickyFooter
                        ? "sticky bottom-0 z-10 -mx-5 mt-5 -mb-5 rounded-b-[24px] border-t border-border-subtle bg-bg-card px-5 py-4"
                        : "mt-5",
                  )}
                >
                  {footer}
                </div>
              ) : null}
            </m.section>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(node, document.body);
}
