"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useStoriesViewer } from "@/features/home/stories-viewer-context";

/**
 * PERF-17 — полноэкранный просмотрщик историй лежал статическим импортом в
 * чанке главной страницы, хотя открывается кликом по ленте историй, а у
 * посетителя без историй в ленте не открывается вовсе.
 *
 * `ssr: false` ничего не меняет по смыслу: сам оверлей рендерится в
 * `createPortal(document.body)` и до монтирования возвращает `null`, то есть
 * в серверной разметке его не было никогда.
 */
const StoriesViewerOverlay = dynamic(
  () => import("@/features/home/components/stories-viewer-overlay").then((m) => m.StoriesViewerOverlay),
  { ssr: false, loading: () => null },
);

/**
 * Монтирует оверлей при первом открытии истории и больше не размонтирует.
 *
 * «Больше не размонтирует» — не экономия, а условие корректности: закрытие
 * анимируется `AnimatePresence` ВНУТРИ оверлея, и если снимать его с
 * дерева в тот же момент, когда просмотр закончился, выходную анимацию
 * играть будет уже некому. Поэтому здесь только один переход — «ни разу не
 * открывали» → «открывали», — а всё остальное по-прежнему решает сам
 * оверлей по состоянию контекста.
 */
export function StoriesViewerOverlayLazy() {
  const { state } = useStoriesViewer();
  const [activated, setActivated] = useState(false);

  // Правка состояния в фазе рендера, а не в эффекте: React отрабатывает её
  // повторным рендером ДО коммита, поэтому кадра с пустым оверлеем не
  // возникает. Через `useEffect` тот же переход стоил бы лишнего коммита и
  // упирался в `react-hooks/set-state-in-effect`.
  if (state && !activated) setActivated(true);

  if (!activated) return null;

  return <StoriesViewerOverlay />;
}
