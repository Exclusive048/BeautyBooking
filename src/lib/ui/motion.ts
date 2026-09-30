import type { Transition } from "framer-motion";

/**
 * Движение продукта — ОДИН набор (29.09 доработки · 19, UI-12; решение
 * владельца 19.1). До него в дереве жили 5 кривых, 17 длительностей framer,
 * 14 дистанций и 6 пружин: одинаковые по смыслу появления шли в разном темпе, а
 * «второй канон» `[0.25, 0.1, 0.25, 1]` сидел в восьми файлах локальной
 * константой.
 *
 * Модуль отдаёт готовые ОБЪЕКТЫ перехода, а не числа: так вызывающий не собирает
 * `{ duration, ease }` сам и не может взять длительность от одной ступени, а
 * кривую — от другой. Литералы `ease:` / `duration:` вне модуля ловит
 * `src/lib/ui/motion-canon.test.ts`.
 *
 * Тем, кто просил не двигать интерфейс, движение гасит `MotionConfig
 * reducedMotion="user"` в `MotionProvider` (transform и layout — да, прозрачность
 * — нет), поэтому вызывающий НЕ пишет `reduce ? { duration: 0 } : …`, а
 * `initial` не зависит от `useReducedMotion()` — иначе сервер (всегда «не
 * просил») и клиент расходятся, и гидратация оставляет блок с `opacity: 0`.
 *
 * Hover и нажатие — КЛАССАМИ (`components/ui/motion-classes.ts`), а не
 * `whileHover` / `whileTap`: пропсы добавили бы потребителей framer.
 */

/** Кривая продукта: быстрый старт, мягкая остановка. Она же `ease-brand` в Tailwind. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Кривая ухода: разгон к краю — элемент «уходит», а не «приезжает». */
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

/**
 * Ступени длительности (с): `micro` — отклик элемента (меню, подсказка,
 * переключатель), `base` — модалка, шторка, смена шага, `section` — появление
 * секции при прокрутке; `exit` — уход и сворачивание.
 */
export const MOTION = {
  micro: { duration: 0.18, ease: EASE },
  base: { duration: 0.28, ease: EASE },
  section: { duration: 0.45, ease: EASE },
  exit: { duration: 0.18, ease: EASE_EXIT },
} as const satisfies Record<string, Transition>;

/**
 * Без анимации — ТОЛЬКО для размеров (высота, ширина) у тех, кто просил не
 * двигать интерфейс: `reducedMotion="user"` гасит transform, а раскрытие по
 * высоте — нет. Для transform писать `reduce ? INSTANT : …` не нужно.
 */
export const INSTANT = { duration: 0 } as const satisfies Transition;

/** Пружина выезжающих слоёв (шторки, нижние меню) — одна вместо шести. */
export const SPRING_SHEET = { type: "spring", stiffness: 380, damping: 34 } as const satisfies Transition;

/** Шаг ступенчатого появления карточек в сетке (с). */
export const STAGGER = 0.08;

/**
 * Дистанции появления (px): `rise` — секция или карточка поднимается на место,
 * `nudge` — мелкий элемент (меню, подсказка) подвигается. Выезд снизу — `"100%"`.
 */
export const DISTANCE = { rise: 16, nudge: 6 } as const;

/** Появление при прокрутке — один раз, чуть раньше входа в экран. */
export const VIEWPORT_ONCE = { once: true, margin: "-80px" } as const;

/** Задержка ступени в сетке: `staggerDelay(i)` = `i × STAGGER`. */
export function staggerDelay(index: number): number {
  return index * STAGGER;
}
