/**
 * STUDIO-PORTFOLIO-FEED (2026-09-24) — подпись работы на фото: «мастер · услуга».
 *
 * Одна функция на ленту и истории, чтобы подпись читалась одинаково.
 * `performerName` есть только у фото студии (автор — студия, исполнитель —
 * её мастер); у работы мастера исполнитель и есть автор, и имя повторять не
 * нужно — остаётся услуга. Пустая подпись — `null`: плашку не рисуем.
 */
export function formatWorkCaption(
  performerName: string | null | undefined,
  serviceTitle: string | null | undefined,
): string | null {
  const parts = [performerName, serviceTitle]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}
