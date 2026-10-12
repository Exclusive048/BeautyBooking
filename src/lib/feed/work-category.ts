import { CategoryStatus } from "@prisma/client";

/**
 * Категория работы портфолио для подписи, когда услуга к работе не привязана
 * (у работ мастера это частый случай: при загрузке выбирают категорию, услугу —
 * по желанию). Наружу — только одобренная и видимая всем (инв. #23): категория
 * на модерации публичной подписью не становится.
 *
 * Читают ленты портфолио, главной и истории — правило одно.
 */
export const PORTFOLIO_CATEGORY_INCLUDE = {
  select: { name: true, status: true, visibleToAll: true },
} as const;

export function publicCategoryTitle(
  category: { name: string; status: CategoryStatus; visibleToAll: boolean } | null | undefined,
): string | null {
  if (!category || category.status !== CategoryStatus.APPROVED || !category.visibleToAll) return null;
  return category.name.trim() || null;
}
