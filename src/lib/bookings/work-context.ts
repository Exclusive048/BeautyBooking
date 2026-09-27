/**
 * STUDIO-MASTER-PROFILES (этап 3, решение владельца 2026-09-27) — КОНТЕКСТ
 * работы у записи: «личная» или «студии».
 *
 * Правило одно и следует из того, ГДЕ записали (инв. #45: поверхность =
 * `Booking.providerId`, `studioId` выводится из неё): поверхность — студия
 * (или у строки есть `studioId`) → запись студии; иначе — личная запись
 * мастера. Та же развилка переживёт разделение профилей (этап 4): у записи
 * студийного профиля поверхность — студия, у личной — личный профиль.
 *
 * Модуль клиент-безопасен (без Prisma-рантайма): им пользуются и серверные
 * сервисы кабинета, и компоненты, рисующие пометку.
 */

export type BookingWorkContext =
  | { kind: "PERSONAL" }
  | { kind: "STUDIO"; studioName: string };

/** Что нужно выбрать из строки `Booking`, чтобы вывести контекст. */
export const BOOKING_WORK_CONTEXT_SELECT = {
  studioId: true,
  provider: { select: { type: true, name: true } },
} as const;

type WorkContextRow = {
  studioId: string | null;
  provider: { type: string; name: string };
};

export function resolveBookingWorkContext(row: WorkContextRow): BookingWorkContext {
  if (row.provider.type === "STUDIO") {
    return { kind: "STUDIO", studioName: row.provider.name };
  }
  // `studioId` выводится из поверхности, поэтому у записи не на студии его нет;
  // ветка — страховка на случай строки, где поверхность и колонка разошлись.
  if (row.studioId) return { kind: "STUDIO", studioName: "" };
  return { kind: "PERSONAL" };
}

/**
 * Показывать ли пометку вообще. Соло-мастер работает в одном контексте, и
 * пометка «личная» на каждой его записи — шум, а не информация (решение
 * владельца: «чтобы флоу не усложнилось»). Пометка нужна мастеру, который
 * работает и лично, и в студии, — либо у него уже есть студийные записи.
 */
export function shouldShowWorkContext(input: {
  masterInStudio: boolean;
  contexts: Iterable<BookingWorkContext>;
}): boolean {
  if (input.masterInStudio) return true;
  for (const context of input.contexts) {
    if (context.kind === "STUDIO") return true;
  }
  return false;
}

export type RevenueSplit = { personal: number; studio: number };

/** Выручка по контекстам: личная — деньги мастера, студийная — оборот студии. */
export function splitRevenueByWorkContext(
  items: Iterable<{ context: BookingWorkContext; amount: number }>,
): RevenueSplit {
  const split: RevenueSplit = { personal: 0, studio: 0 };
  for (const item of items) {
    if (item.context.kind === "STUDIO") split.studio += item.amount;
    else split.personal += item.amount;
  }
  return split;
}
