"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { FOCUSABLE_SELECTOR } from "@/components/ui/use-modal-a11y";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/cn";
import { menuTopNearAnchor } from "@/lib/ui/menu-placement";

/**
 * Всплывающая панель у якоря — порталом в `body`, слой `z-popover`
 * (29.09 доработки · 21, UI-14).
 *
 * Зачем портал: меню шапки жили внутри `TopbarShell` (`sticky` + `backdrop-blur`),
 * а такой предок образует контекст наложения — всё внутри глобально стояло на
 * уровне шапки (30), под нижней навигацией, cookie-уведомлением и промптами, как
 * бы ни был велик их собственный `z-[100]`. Число побольше тут ничего не решает.
 *
 * Паттерн — обкатанный в `booking-card-actions-menu.tsx`: координаты от
 * `getBoundingClientRect` якоря, пересчёт на scroll (capture) и resize, закрытие
 * по клику вне и Escape; за `useIsHydrated` (портал — только на клиенте).
 * Координаты пишутся прямо в стиль панели, без состояния React: пересчёт на
 * каждый scroll не перерисовывает содержимое меню.
 * Контейнер портала живёт, пока смонтирован компонент: `AnimatePresence` внутри
 * успевает проиграть уход.
 *
 * Клавиатура: в DOM меню теперь не рядом с кнопкой, поэтому фокус переносится
 * явно. Открыли с клавиатуры (у кнопки `:focus-visible`) — фокус в первый
 * пункт; мышью или касанием — в саму панель без кольца (иначе первый пункт
 * выглядел бы выбранным), и Tab ведёт в пункты. Escape и Tab за крайний пункт
 * закрывают панель и возвращают фокус на якорь.
 *
 * UX-PASS-01: панель публикует переменную `--anchored-max-h` — сколько места
 * есть на экране от её верха до нижнего края (при `flip` вверх — от края до
 * якоря), за вычетом отступа. Высокое содержимое берёт её классом
 * `max-h-[var(--anchored-max-h)] overflow-y-auto` и прокручивается внутри:
 * у `position: fixed` иначе низ меню на невысоком экране был недостижим.
 * Сама панель не обрезает и не прокручивает (у содержимого тень и масштаб
 * анимации), поэтому вызывающим, которые переменную не читают, ничего не меняется.
 */
type Props = {
  open: boolean;
  /** Элемент, к которому крепится панель (обёртка кнопки или сама кнопка). */
  anchorRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  /** По какому краю якоря выравнивать: `end` — правые края совпадают. */
  align?: "start" | "end";
  /** Зазор между якорем и панелью, px. */
  offset?: number;
  /** Перенести фокус в панель при открытии (меню — да). */
  autoFocus?: boolean;
  /**
   * UX-PASS-01: у нижнего края экрана (с учётом нижней навигации телефона)
   * открываться над якорем. Для меню строк списка — нижняя строка иначе
   * открывала меню за край экрана.
   */
  flip?: boolean;
  className?: string;
  children: ReactNode;
};

const EDGE_GAP_PX = 8;

/** UX-PASS-01: доступная панели высота (px) — см. JSDoc компонента. */
const MAX_HEIGHT_VAR = "--anchored-max-h";

function focusAnchor(anchor: HTMLElement | null) {
  if (!anchor) return;
  const target = anchor.matches(FOCUSABLE_SELECTOR) ? anchor : anchor.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  target?.focus();
}

export function AnchoredPortal({
  open,
  anchorRef,
  onDismiss,
  align = "start",
  offset = 8,
  autoFocus = true,
  flip = false,
  className,
  children,
}: Props) {
  const hydrated = useIsHydrated();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    // Высота меряется без прежнего потолка — иначе урезанная в прошлый раз
    // панель «помещалась» бы и решение о направлении скакало.
    panel.style.removeProperty(MAX_HEIGHT_VAR);
    const top = flip ? menuTopNearAnchor(rect, panel.offsetHeight, offset) : rect.bottom + offset;
    panel.style.top = `${top}px`;
    const opensUp = top < rect.bottom;
    const available = opensUp
      ? rect.top - offset - EDGE_GAP_PX
      : window.innerHeight - top - EDGE_GAP_PX;
    panel.style.setProperty(MAX_HEIGHT_VAR, `${Math.max(0, Math.floor(available))}px`);
    if (align === "end") {
      panel.style.left = "auto";
      panel.style.right = `${Math.max(EDGE_GAP_PX, viewportWidth - rect.right)}px`;
    } else {
      panel.style.right = "auto";
      panel.style.left = `${Math.max(EDGE_GAP_PX, rect.left)}px`;
    }
    panel.style.visibility = "visible";
  }, [anchorRef, align, offset, flip]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      dismissRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dismissRef.current();
      focusAnchor(anchorRef.current);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition, anchorRef]);

  useEffect(() => {
    if (!open || !autoFocus) return;
    const opener = document.activeElement;
    const viaKeyboard =
      opener instanceof HTMLElement && Boolean(anchorRef.current?.contains(opener)) && opener.matches(":focus-visible");
    // Панель монтирует содержимое в том же кадре (AnimatePresence) — фокус
    // после отрисовки.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = viaKeyboard ? panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) : panel;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, autoFocus, anchorRef]);

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])];
    if (items.length === 0) return;
    const leavingForward = !event.shiftKey && document.activeElement === items[items.length - 1];
    const leavingBackward =
      event.shiftKey && (document.activeElement === items[0] || document.activeElement === panelRef.current);
    if (!leavingForward && !leavingBackward) return;
    event.preventDefault();
    dismissRef.current();
    focusAnchor(anchorRef.current);
  };

  if (!hydrated) return null;
  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className={cn("fixed z-popover outline-none", className)}
      // До первого пересчёта координат панель не видна (координаты — в `reposition`).
      style={{ visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
