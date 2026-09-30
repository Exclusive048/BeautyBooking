import { AppError } from "@/lib/api/errors";

/**
 * 29.09 доработки · 13 — как секция публичной страницы читает сервис.
 *
 * Отказ сервиса 4xx (`AppError`: профиль не найден, не опубликован, неверный
 * ключ) — «пусто»: ровно так секции вели себя, пока ходили HTTP-запросом к
 * собственному API (не-2xx → пустой список / `null`).
 *
 * 5xx и любое другое исключение — наверх: секция покажет «Не удалось загрузить
 * блок» и запишет отказ (`reportPublicBlockError`). Это осознанное уточнение —
 * через HTTP отказ базы приходил статусом 500 и маскировался под «отзывов нет».
 */
export async function emptyOnRefusal<T>(read: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return empty;
    throw error;
  }
}
