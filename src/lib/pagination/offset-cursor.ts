import { AppError } from "@/lib/api/errors";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";

/**
 * MOBILE-MASTER-C — страница списка, который сервис кабинета уже собрал целиком
 * (канбан, клиенты, отзывы: веб показывает их одним экраном, сервис считает по
 * всему набору KPI и счётчики вкладок). Приложению нужен постраничный вывод, а
 * пересобирать эти сервисы под keyset-пагинацию ради него незачем — набор и так
 * ограничен окном сервиса.
 *
 * Курсор непрозрачен (`encodeCursor` смещения, SEC-12): клиент его не
 * разбирает, и форму можно будет сменить без смены контракта. Набор между
 * страницами может сдвинуться (пришла новая запись) — для списков кабинета
 * это приемлемо: потяните для обновления.
 */

const PREFIX = "o:";

export function encodeOffsetCursor(offset: number): string {
  return encodeCursor(`${PREFIX}${offset}`);
}

/** Смещение из курсора; `null` — курсор не наш или испорчен. */
export function decodeOffsetCursor(cursor: string): number | null {
  const decoded = decodeCursor(cursor);
  if (!decoded || !decoded.startsWith(PREFIX)) return null;
  const raw = decoded.slice(PREFIX.length);
  if (!/^\d{1,6}$/.test(raw)) return null;
  return Number(raw);
}

/** Смещение из необязательного курсора запроса; испорченный — 400 `VALIDATION_ERROR`. */
export function readOffsetCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const offset = decodeOffsetCursor(cursor);
  if (offset === null) {
    throw new AppError("Список обновился. Загрузите его заново.", 400, "VALIDATION_ERROR", {
      issues: [{ path: "cursor", message: "Курсор не распознан.", code: "custom" }],
    });
  }
  return offset;
}

export type OffsetPage<T> = {
  items: T[];
  /** Курсор следующей страницы; `null` — это последняя. */
  nextCursor: string | null;
  /** Сколько элементов во всём наборе (до пагинации). */
  total: number;
};

export function paginateByOffset<T>(list: readonly T[], offset: number, limit: number): OffsetPage<T> {
  const items = list.slice(offset, offset + limit);
  const next = offset + items.length;
  return {
    items,
    nextCursor: items.length > 0 && next < list.length ? encodeOffsetCursor(next) : null,
    total: list.length,
  };
}
