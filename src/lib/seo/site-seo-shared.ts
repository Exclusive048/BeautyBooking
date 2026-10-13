/**
 * SEO-ADMIN-01: заголовок и описание главной из админки — правило без
 * серверных зависимостей. Его читают и сервер (что показать на сайте), и форма
 * админки в браузере (счётчик знаков, можно ли сохранить).
 *
 * Пределы — сколько показывают поисковики: заголовок обрезается примерно на
 * 60–70 знаках, описание — около 160 (та же граница у текстов в коде,
 * `page-metadata.test.ts`).
 */
export const SITE_SEO_TITLE_MAX = 70;
export const SITE_SEO_DESCRIPTION_MAX = 160;

/** Что лежит в настройках; `null` — поле не заполнено. */
export type StoredSiteSeo = { title: string | null; description: string | null };

export type SiteSeoText = { title: string; description: string };

/** Пробелы и переводы строк схлопываются: в выдаче они не нужны. */
export function normalizeSiteSeoText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function usable(value: string | null, max: number): string | null {
  const text = normalizeSiteSeoText(value);
  return text && text.length <= max ? text : null;
}

/**
 * Текст с сайта: из админки, если поле заполнено и укладывается в предел, иначе
 * из кода. Длинный текст из админки не обрезается: он мог быть сохранён до
 * пределов, а обрезка по слову поменяла бы смысл без ведома автора.
 */
export function resolveSiteSeo(stored: StoredSiteSeo, defaults: SiteSeoText): SiteSeoText {
  return {
    title: usable(stored.title, SITE_SEO_TITLE_MAX) ?? defaults.title,
    description: usable(stored.description, SITE_SEO_DESCRIPTION_MAX) ?? defaults.description,
  };
}
