"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * MODAL-A11Y-BATCH-A (2026-05-23) — shared a11y helpers for modal/drawer
 * primitives. Closes UI-1 from UI-UX-AUDIT-A (WCAG SC 2.4.3 Focus Order +
 * SC 3.2.1 On Focus). Pattern 14: single primitive fix hardens all callers
 * (50+ ModalSurface + 5+ Drawer migrations).
 *
 * Hooks:
 *   - `useReturnFocus(open)` — captures `document.activeElement` on open,
 *     restores it on close/unmount. Works across React strict-mode double
 *     mounts (we only capture the FIRST time `open` flips from false→true).
 *   - `useInitialFocus(open, containerRef, initialFocusRef?)` — focuses
 *     `initialFocusRef.current` if provided, else the first focusable
 *     child inside `containerRef`, else the container itself (with
 *     `tabIndex={-1}` set by caller).
 *   - `useFocusTrap(containerRef, enabled)` — cycles Tab / Shift+Tab
 *     within the container's focusable descendants. Standard pattern
 *     mirrors stories-viewer-overlay.handleTabTrap (which stays
 *     independent — different concerns).
 *
 * All three are side-effect-free outside their useEffect lifecycle and
 * tolerate `containerRef.current === null` (e.g. before portal mounts).
 *
 * Why custom and not `@radix-ui/react-focus-scope`: not in deps; adding
 * a Radix package for one primitive would expand the dep surface. The
 * custom implementation is ~50 LOC + matches the existing
 * stories-viewer manual implementation pattern (which we leave alone —
 * different specialized concerns: arrow-key nav, swipe, progress bars).
 */

// Exported for test discoverability (`use-modal-a11y.test.ts`).
// Standard set covering all interactive elements per WAI-ARIA Authoring
// Practices for dialog focus management.
export const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

// Exported for test discoverability (`use-modal-a11y.test.ts`).
export function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  // `button:not([disabled])` ловит и кнопку с `tabindex="-1"` — невидимую
  // подложку «клик мимо закрывает». Шагом табуляции она не является: браузер
  // её пропускает. Считай её ловушка первой/последней, Tab с края уводил бы
  // фокус из окна, а начальный фокус вставал бы на подложку без кольца —
  // так и было в просмотре фото портфолио студии (2026-10-10).
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("tabindex") !== "-1",
  );
}

/**
 * Pure decision helper extracted from `useFocusTrap` for unit testing.
 * Given the Tab event direction + focusable elements + currently active
 * element + container, returns:
 *   - `null` — let the browser handle Tab (focus stays inside container)
 *   - `{ target, preventDefault: true }` — wrap focus to target
 *
 * Wrapping cases (Tab cycles inside dialog):
 *   - Shift+Tab from first focusable → wrap to last
 *   - Tab from last focusable → wrap to first
 *   - Active element OUTSIDE container (focus escaped) → wrap to first
 *     (Tab) or last (Shift+Tab)
 *
 * Edge case: empty focusable list → preventDefault + no target (nothing
 * to focus; container itself should have tabIndex=-1 and the caller
 * focuses it via useInitialFocus).
 */
export type FocusTrapDecision =
  | { kind: "ignore" }
  | { kind: "block" }
  | { kind: "wrap"; target: HTMLElement };

export function decideFocusTrap(input: {
  shiftKey: boolean;
  focusable: ReadonlyArray<HTMLElement>;
  activeElement: HTMLElement | null;
  container: HTMLElement;
}): FocusTrapDecision {
  const { shiftKey, focusable, activeElement, container } = input;
  if (focusable.length === 0) return { kind: "block" };
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const isOutsideContainer = !activeElement || !container.contains(activeElement);
  if (shiftKey) {
    if (activeElement === first || isOutsideContainer) {
      return { kind: "wrap", target: last };
    }
  } else {
    if (activeElement === last || isOutsideContainer) {
      return { kind: "wrap", target: first };
    }
  }
  return { kind: "ignore" };
}

export function useReturnFocus(open: boolean): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Capture the element that opened the modal. The cleanup function
    // restores it when `open` flips back to false OR the component
    // unmounts. Guard against the opener being removed from DOM
    // (fallback: document.body so focus doesn't land nowhere).
    previouslyFocused.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    return () => {
      const target = previouslyFocused.current;
      if (target && document.body.contains(target)) {
        target.focus();
      }
      previouslyFocused.current = null;
    };
  }, [open]);
}

export function useInitialFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    // Defer one frame so framer-motion's mount animation doesn't fight
    // for the active element. Falls back through the priority chain
    // until something focusable is found.
    const id = window.requestAnimationFrame(() => {
      const explicit = initialFocusRef?.current ?? null;
      if (explicit) {
        explicit.focus();
        return;
      }
      const focusable = getFocusable(containerRef.current);
      if (focusable.length > 0) {
        focusable[0]!.focus();
        return;
      }
      // Last resort: focus the container itself. Caller must give it
      // tabIndex={-1} for this to work; we don't mutate it here to
      // avoid surprise reflow.
      containerRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, containerRef, initialFocusRef]);
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  const handler = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
      const active = document.activeElement as HTMLElement | null;
      const decision = decideFocusTrap({
        shiftKey: event.shiftKey,
        focusable,
        activeElement: active,
        container,
      });
      if (decision.kind === "ignore") return;
      event.preventDefault();
      if (decision.kind === "wrap") {
        decision.target.focus();
      }
    },
    [containerRef],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, handler]);
}

/**
 * Блокировка прокрутки страницы под слоем — единственная реализация в
 * проекте (UI-13: копии этого блока уже однажды разъехались по примитивам).
 *
 * Отдельным хуком, а не только внутри `useOverlayA11y`, потому что бывают
 * полноэкранные слои, которые НЕ модальны: режим карты каталога на телефоне
 * закрывает страницу, но нижняя навигация под ним остаётся рабочей, и
 * запирать фокус там нельзя. `mediaQuery` ограничивает блокировку раскладкой,
 * где слой действительно полноэкранный.
 */
export function useBodyScrollLock(active: boolean, mediaQuery?: string): void {
  useEffect(() => {
    if (!active) return;
    if (mediaQuery && !window.matchMedia(mediaQuery).matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active, mediaQuery]);
}

/**
 * 29.09 доработки · 01-б — пока открыт хотя бы один модальный слой, на `<html>`
 * стоит `data-overlay-open`: нижняя навигация (`BottomTabBar`) по нему прячется.
 * Жалоба «панель яркая поверх затемнения» в Chromium не воспроизводилась, но
 * скрытие снимает её при любой причине (WebKit/PWA, размытие панели) и заодно
 * убирает панель из касаний и из дерева доступности, пока окно открыто.
 *
 * Счётчик, а не флаг: слои вкладываются (окно поверх листа «Ещё»), и закрытие
 * внутреннего не должно возвращать панель, пока открыт внешний. Снятие — в
 * cleanup эффекта, поэтому размонтирование без закрытия счётчик не «залипает».
 */
const overlayCounts = new WeakMap<HTMLElement, number>();

export function markOverlayOpen(root: HTMLElement): () => void {
  overlayCounts.set(root, (overlayCounts.get(root) ?? 0) + 1);
  root.dataset.overlayOpen = "";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = Math.max(0, (overlayCounts.get(root) ?? 1) - 1);
    overlayCounts.set(root, next);
    if (next === 0) delete root.dataset.overlayOpen;
  };
}

function useOverlayOpenMarker(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    return markOverlayOpen(document.documentElement);
  }, [open]);
}

/**
 * UI-13 — весь контракт модального оверлея одним вызовом.
 *
 * Три focus-хука выше существовали и раньше, но контракт ими не
 * исчерпывается: «диалог» — это ЕЩЁ и Escape, и блокировка прокрутки фона.
 * Эти две части жили копиями в `ModalSurface` и `Drawer` (блоки совпадали
 * дословно) и **отсутствовали** у оверлеев, написанных мимо примитивов, —
 * а именно у них `aria-modal="true"` уже стоял. Это худший вариант из
 * возможных: атрибут ОБЕЩАЕТ вспомогательной технологии, что фокус заперт,
 * и скринридер ведёт себя соответственно, тогда как Tab спокойно уходит на
 * страницу под оверлеем. Ложное обещание хуже отсутствующего.
 *
 * Хук не рендерит и не стилизует ничего — поэтому его можно надеть на
 * существующую разметку, не трогая ни вёрстку, ни анимацию. Портал в него
 * намеренно НЕ входит: позиционную часть (`fixed` внутри transform-предка)
 * в этом проекте уже сторожит ESLint-правило со своим списком исключений,
 * и дублировать это решение вторым механизмом значило бы завести два
 * источника правды на один вопрос.
 */
export function useOverlayA11y({
  open,
  onClose,
  containerRef,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
}): void {
  useBodyScrollLock(open);
  useOverlayOpenMarker(open);
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  useReturnFocus(open);
  useInitialFocus(open, containerRef, initialFocusRef);
  useFocusTrap(containerRef, open);
}
