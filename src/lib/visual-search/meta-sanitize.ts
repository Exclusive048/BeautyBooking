import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

/**
 * SEC-18 — вывод vision-модели писался в `MediaAsset.visualMeta` как есть
 * (`visualResult.meta as Prisma.InputJsonValue`): типизирован был только
 * `text_description`, а сам объект — произвольный JSON от модели, чей вход —
 * загруженное провайдером изображение. Текст на картинке — тоже вход модели,
 * то есть содержимое `visualMeta` в пределе определяет загрузивший.
 *
 * Это не «просто блоб в БД»: `searcher.ts` фильтрует по нему сырым SQL
 * (`"visualMeta"->>field = value`), поэтому лишние ключи — это управление
 * выдачей поиска, а неограниченный объём — расход БД.
 *
 * Аллоулист не выдуман: `strategy.filterFields` УЖЕ объявляет, какие поля
 * стратегия использует как фильтры, и `extractFilterPairs` (`searcher.ts:73-91`)
 * читает ровно их и ровно скаляры. Поэтому сужение к этому набору для
 * единственного потребителя **без потерь** — и лучше статической Zod-схемы,
 * которая дублировала бы список полей отдельно от стратегии и разошлась бы с
 * ней при добавлении категории.
 */

/** Значения сравниваются как `->>` (строка), поэтому длина ограничена по-строковому. */
const MAX_VALUE_CHARS = 200;

export function sanitizeVisualMeta(
  meta: Record<string, unknown>,
  strategy: VisualSearchStrategy,
): Record<string, string> {
  const clean: Record<string, string> = {};

  for (const field of strategy.filterFields) {
    const value = meta[field];

    // Ровно те типы, которые `extractFilterPairs` умеет превратить в фильтр.
    // Объекты и массивы отбрасываются: `->>` вернул бы по ним JSON-текст,
    // сравнивать который не с чем.
    if (typeof value === "string") {
      const trimmed = value.trim().slice(0, MAX_VALUE_CHARS);
      if (trimmed.length > 0) clean[field] = trimmed;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[field] = String(value);
      continue;
    }
    if (typeof value === "boolean") {
      clean[field] = String(value);
    }
  }

  return clean;
}
