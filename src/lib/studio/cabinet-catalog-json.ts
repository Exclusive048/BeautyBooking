import type { StudioServiceListItem } from "@/features/studio-cabinet/services/lib/types";

/**
 * MOBILE-STUDIO-C (каталог) — JSON-формы кабинета студии для приложения поверх
 * типов веб-сервисов. Веб называет категорию каталога `categoryId`; в API она
 * `globalCategoryId` (как в `PATCH /api/studio/services/{id}`), чтобы не
 * путать с устаревшей `ServiceCategory`.
 */

export type StudioServiceJson = {
  id: string;
  name: string;
  durationMin: number;
  priceKopeks: number;
  globalCategoryId: string | null;
  isActive: boolean;
  onlinePaymentEnabled: boolean;
  sortOrder: number;
  bookings30d: number;
  mastersCount: number;
  masters: StudioServiceListItem["masters"];
};

export function toStudioServiceJson(item: StudioServiceListItem): StudioServiceJson {
  return {
    id: item.id,
    name: item.name,
    durationMin: item.durationMin,
    priceKopeks: item.priceKopeks,
    globalCategoryId: item.categoryId,
    isActive: item.isActive,
    onlinePaymentEnabled: item.onlinePaymentEnabled,
    sortOrder: item.sortOrder,
    bookings30d: item.bookings30d,
    mastersCount: item.mastersCount,
    masters: item.masters,
  };
}

/** Мобильный путь карточки записи студии (цель тапа и push). */
export function studioBookingHref(bookingId: string): string {
  return `/studio/bookings/${bookingId}`;
}

/**
 * Ключ клиента из сегмента пути: Next отдаёт его уже раскодированным, но
 * повторное раскодирование безопасно (в ключе нет `%`), а битая
 * последовательность — это просто неверный ключ.
 */
export function readClientKeyParam(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return "";
  }
}

/** Строка списка клиентов студии: телефона нет — `null` (у веба — «—»). */
export function toStudioClientJson<T extends { phone: string }>(row: T): Omit<T, "phone"> & { phone: string | null } {
  return { ...row, phone: row.phone === "—" || !row.phone.trim() ? null : row.phone };
}
