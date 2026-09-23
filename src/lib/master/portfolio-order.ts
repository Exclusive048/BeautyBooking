import type { Prisma } from "@prisma/client";

/**
 * CATALOG-MAIN-PHOTO — единый порядок работ портфолио мастера.
 *
 * Кабинетная сетка (`portfolio-view.service.ts`) и стрелки «выше/ниже»
 * (`reorderMasterPortfolio`) давно жили в этом порядке, а каталог и поиск по
 * времени брали самые СВЕЖИЕ работы (`createdAt desc`) — то есть ручной
 * порядок мастера нигде, кроме его же кабинета, не действовал. Теперь порядок
 * один на все поверхности, и главное фото карточки каталога — первая
 * ПУБЛИЧНАЯ работа в нём («Сделать главным» ставит работу в начало).
 *
 * Модуль без рантайм-импортов: его читают и серверные запросы, и клиентская
 * разметка кабинета.
 */
export const PORTFOLIO_DISPLAY_ORDER = [
  { sortOrder: "asc" },
  { createdAt: "desc" },
] satisfies Prisma.PortfolioItemOrderByWithRelationInput[];

/** Главное фото — первая публичная работа в порядке показа. */
export function findCatalogCoverId<T extends { id: string; isPublic: boolean }>(
  itemsInDisplayOrder: readonly T[],
): string | null {
  return itemsInDisplayOrder.find((item) => item.isPublic)?.id ?? null;
}
