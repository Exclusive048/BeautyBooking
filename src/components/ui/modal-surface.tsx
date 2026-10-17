"use client";

import { useId, useRef, type ReactNode, type RefObject, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DISTANCE, MOTION, SPRING_SHEET } from "@/lib/ui/motion";
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
   * Закрепить подвал внизу, пока окно длиннее экрана: кнопки шагов длинной
   * формы (часы по дням на телефоне) не уезжают за прокрутку.
   */
  stickyFooter?: boolean;
  /**
   * На телефоне (до `sm`) — экран целиком, как отдельная страница: шапка с
   * крестиком закреплена сверху, подвал прижат к низу с отступом под
   * «домашнюю полоску»; с `sm` окно прежнее. Для длинных форм и пошаговых
   * сценариев (запись, услуга, график). Без флага на телефоне — нижняя шторка.
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
  /**
   * `id` заголовка, который окно рисует само в `children` (без `title` /
   * `header`), — чтобы у диалога всё равно было доступное имя.
   */
  ariaLabelledBy?: string;
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

/** Шторку закрывает протяжка вниз за шапку дальше этого порога (px). */
const SHEET_DISMISS_PX = 80;

/**
 * Окно поверх страницы.
 *
 * modals-investigation: рендер — порталом в `document.body`, поэтому
 * `fixed inset-0` всегда привязан к экрану, а не к предку с `transform` /
 * `filter` / `backdrop-filter` (три рецидива «верх окна срезан»).
 *
 * MOBILE-SHEETS-01 (2026-10-14, замечание владельца: «раскрывается почти на
 * весь экран, но не на весь — как будто не по-мобильному»). До `sm` окно было
 * карточкой с полями 16px по бокам и 40px сверху и снизу, без крестика и без
 * своей прокрутки: длинная форма уезжала вместе с подложкой. Теперь на
 * телефоне две формы, и обе — родные для телефона:
 *  - **нижняя шторка** (по умолчанию): выезжает снизу, скругление только
 *    сверху, ручка и крестик в закреплённой шапке, своя прокрутка, отступ под
 *    «домашнюю полоску»; закрывается крестиком, подложкой, Escape и протяжкой
 *    вниз за шапку. Короткое окно — компактная шторка, длинное — высокая;
 *  - **экран целиком** (`fullScreenOnMobile`): для длинных форм и сценариев
 *    по шагам — читается как отдельная страница.
 * С `sm` — прежняя карточка по центру, с прокруткой всего слоя.
 *
 * Side effects: body scroll lock while open, ESC closes, backdrop click
 * closes — the panel stops propagation (`useOverlayA11y`).
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
  ariaLabelledBy: ownLabelledBy,
  children,
  className,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  // Анимация входа зависит от раскладки: на телефоне окно выезжает снизу,
  // с `sm` — появляется по центру. Портал рисуется только после гидратации,
  // так что серверное значение хука на экран не попадает.
  const isWide = useMediaQuery("(min-width: 640px)");
  // MODAL-A11Y-BATCH-A: prefers-reduced-motion уважается централизованно —
  // `MotionConfig reducedMotion="user"` (MotionProvider) гасит масштаб и сдвиг,
  // оставляя прозрачность (29.09 доработки · 19).

  // MODAL-A11Y-BATCH-A + UI-13: весь контракт диалога одним вызовом —
  // Escape, блокировка прокрутки фона, WCAG SC 2.4.3 (Focus Order) и
  // SC 3.2.1 (On Focus).
  useOverlayA11y({ open, onClose, containerRef: panelRef, initialFocusRef });

  // MODAL-SSR-OPEN-HYDRATION: портала нет в серверной разметке, поэтому и
  // первый клиентский рендер обязан отдать `null` — иначе диалог, открытый на
  // первом рендере (`open` из URL), даёт hydration mismatch.
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;

  const headerTitle = header?.title ?? title ?? null;
  const ariaLabelledBy = headerTitle ? titleId : ownLabelledBy;
  const fullScreen = fullScreenOnMobile;

  // Протяжка шторки вниз: двигается обёртка, а не панель — у панели свой
  // `transform` от framer. Только шапка — содержимое прокручивается.
  function onSheetTouchStart(event: TouchEvent) {
    if (isWide) return;
    dragStartY.current = event.touches[0]?.clientY ?? null;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }
  function onSheetTouchMove(event: TouchEvent) {
    const start = dragStartY.current;
    const sheet = sheetRef.current;
    if (start === null || !sheet) return;
    const delta = Math.max(0, (event.touches[0]?.clientY ?? start) - start);
    sheet.style.transform = delta > 0 ? `translateY(${delta}px)` : "";
  }
  function onSheetTouchEnd(event: TouchEvent) {
    const start = dragStartY.current;
    const sheet = sheetRef.current;
    dragStartY.current = null;
    if (start === null || !sheet) return;
    sheet.style.transition = "";
    const delta = (event.changedTouches[0]?.clientY ?? start) - start;
    if (delta > SHEET_DISMISS_PX) {
      onClose();
      return;
    }
    sheet.style.transform = "";
  }

  const heading = header ? (
    <header className="flex items-start gap-3">
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
    <h3 id={titleId} className="text-base font-semibold text-text-main">
      {title}
    </h3>
  ) : null;

  const closeButton = (
    <Button
      type="button"
      variant="icon"
      size="icon"
      aria-label={UI_TEXT.common.close}
      onClick={onClose}
      className="-mr-2 shrink-0 sm:hidden"
    >
      <X className="h-4 w-4" aria-hidden />
    </Button>
  );

  let top: ReactNode = null;
  if (fullScreen) {
    top = (
      <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-start gap-3 border-b border-border-subtle bg-bg-card px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:static sm:mx-0 sm:mb-3 sm:border-b-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
        <div className="min-w-0 flex-1 pt-2 sm:pt-0">{heading}</div>
        {closeButton}
      </div>
    );
  } else if (heading) {
    top = (
      <div
        className={cn(
          "sticky top-0 z-10 -mx-5 -mt-5 touch-none bg-bg-card px-5 pb-3 pt-2 sm:static sm:mx-0 sm:mt-0 sm:touch-auto sm:bg-transparent sm:p-0",
          header ? "mb-4" : "mb-3",
        )}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
        onTouchCancel={onSheetTouchEnd}
      >
        <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 pt-1 sm:pt-0">{heading}</div>
          {closeButton}
        </div>
      </div>
    );
  }

  const enter = isWide
    ? {
        initial: { opacity: 0, scale: 0.97, y: DISTANCE.nudge },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: DISTANCE.nudge, transition: MOTION.exit },
        transition: MOTION.base,
      }
    : {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%", transition: MOTION.exit },
        transition: SPRING_SHEET,
      };

  const node = (
    <AnimatePresence>
      {open ? (
        <m.div
          key="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          className="fixed inset-0 z-modal overflow-y-auto overscroll-contain bg-black/50"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.micro}
        >
          <div
            ref={sheetRef}
            className="flex min-h-full items-end justify-center transition-transform duration-200 ease-brand sm:items-center sm:p-4"
          >
            <m.section
              ref={panelRef}
              onClick={(event) => event.stopPropagation()}
              initial={enter.initial}
              animate={enter.animate}
              exit={enter.exit}
              transition={enter.transition}
              className={cn(
                fullScreen
                  ? // Телефон: страница во весь экран, без рамки и скругления;
                    // с `sm` — прежняя карточка.
                    "relative flex min-h-[100dvh] w-full flex-col bg-bg-card px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:my-6 sm:block sm:min-h-0 sm:rounded-3xl sm:border sm:border-border-subtle sm:p-5 sm:shadow-hover"
                  : // Телефон: нижняя шторка со своей прокруткой (над ней —
                    // полоска подложки, по ней видно, что это окно, а не
                    // страница); с `sm` — прежняя карточка. Нижний отступ —
                    // одно значение без `sm:`: на ПК `env()` = 0, и это ровно
                    // прежний `p-5` (окна с `className="p-0"` его снимают).
                    "relative max-h-[calc(100dvh-env(safe-area-inset-top,0px)-2rem)] w-full overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border-subtle bg-bg-card p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] shadow-hover sm:my-6 sm:max-h-none sm:overflow-visible sm:rounded-3xl sm:border",
                SIZE_CLASS[size],
                className,
              )}
              tabIndex={-1}
              data-fullscreen-mobile={fullScreen || undefined}
            >
              {top}
              {children}
              {footer ? (
                <div
                  className={cn(
                    "flex justify-end gap-2",
                    stickyFooter
                      ? // Подвал прижат к низу и виден при прокрутке; отступ —
                        // под «домашнюю полоску» (на ПК `env()` = 0).
                        "sticky bottom-0 z-10 -mx-5 -mb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] border-t border-border-subtle bg-bg-card px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4 sm:-mb-5 sm:mt-5 sm:rounded-b-3xl sm:py-4"
                      : fullScreen
                        ? "mt-auto pt-5 sm:mt-5 sm:pt-0"
                        : "mt-5",
                    stickyFooter && (fullScreen ? "mt-auto" : "mt-5"),
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
