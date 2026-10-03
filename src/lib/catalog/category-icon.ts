/**
 * Смайлик категории каталога (`GlobalCategory.icon`) — ДАННЫЕ, а не значок
 * интерфейса: его выбирает администратор, а показывают все поверхности рядом с
 * названием (каталог, поиск, `/models`, кабинеты, админка). Значки интерфейса
 * по-прежнему только lucide.
 *
 * Модуль без зависимостей: его читают и клиентские компоненты, и роуты админки.
 */

/**
 * Ровно один смайлик: пиктограмма с необязательными вариацией (U+FE0F),
 * оттенком кожи и ZWJ-продолжениями («💁‍♀️» — одна картинка из трёх кодов).
 * Буквы, цифры и два смайлика подряд не проходят.
 */
const SINGLE_EMOJI = /^\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic}\uFE0F?)*$/u;

/** Верхняя граница в кодовых единицах: у самых длинных ZWJ-последовательностей — до 11. */
export const CATEGORY_ICON_MAX_LENGTH = 16;

export function isCategoryIcon(value: string): boolean {
  return value.length <= CATEGORY_ICON_MAX_LENGTH && SINGLE_EMOJI.test(value);
}

/** Пустая строка и пробелы — «без смайлика». */
export function normalizeCategoryIcon(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Подпись там, где разметки нет (пункт `<option>`): «💅 Маникюр». */
export function categoryLabel(category: { name: string; icon?: string | null }): string {
  const icon = normalizeCategoryIcon(category.icon);
  return icon ? `${icon} ${category.name}` : category.name;
}

/**
 * Готовые смайлики в окне категории админки: сначала — у системного набора
 * (`system-categories.ts`, порядок тот же), затем — для услуг, которых в наборе
 * нет. Список подсказок, а не ограничение: можно вставить любой смайлик.
 */
export const CATEGORY_ICON_PRESETS: readonly string[] = [
  "💅",
  "🦶",
  "💄",
  "🖌️",
  "👁️",
  "☀️",
  "💁‍♀️",
  "💇",
  "🍯",
  "✨",
  "💆",
  "🧖‍♀️",
  "💋",
  "🧴",
  "🪒",
  "💈",
  "👰",
  "🌸",
];
