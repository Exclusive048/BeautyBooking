"use client";

import { domAnimation, LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

import { MOTION } from "@/lib/ui/motion";

/**
 * Движение продукта (29.09 доработки · 19, PERF-12 + UI-12).
 *
 * `LazyMotion` + `m` вместо `motion`: полный `motion` тянет все возможности
 * framer (жесты, перетаскивание, layout-проекцию) в чанк, который шелл корневого
 * layout'а везёт на КАЖДУЮ страницу (41.5 kB gzip на 90 из 90 маршрутов).
 * `domAnimation` — анимации, уход, hover/tap/focus, появление в экране;
 * `layout` / `layoutId` / `drag` в него НЕ входят и на `m` молча не работают —
 * им место только в островах с `domMax` (реестр — `src/lib/ui/motion-imports.test.ts`).
 *
 * `strict` бросает на `motion.*` внутри дерева: пропущенный при миграции
 * компонент роняет маршрут сразу, а не возвращает полный набор в бандл молча.
 *
 * `reducedMotion="user"` — тем, кто просил не двигать интерфейс, framer сам
 * гасит transform- и layout-анимации, прозрачность оставляет (WCAG 2.3.3).
 * Поэтому компоненты не пишут `reduce ? { duration: 0 } : …`, а их `initial`
 * от `useReducedMotion()` не зависит — иначе сервер и клиент расходятся.
 * `transition` по умолчанию — ступень `MOTION.base`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={MOTION.base}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
