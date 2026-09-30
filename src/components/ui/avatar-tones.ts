/**
 * Цвета заглушки аватара по инициалам (клиенты и отклики на модель-офферы
 * в кабинете мастера) — 29.09 доработки · 23.
 *
 * Это КАТЕГОРИИ, а не статусы: цвет только различает людей в списке, поэтому
 * шкала — палитра Tailwind, ратифицированная посайтово (решение владельца 23.3:
 * «цвета аватаров оставить»). Раньше одна и та же шкала жила копией в двух
 * `lib/format.ts`. Файл лежит в `src/components`, потому что `content` Tailwind
 * `src/lib` не сканирует — классы отсюда иначе не попали бы в бандл.
 */
const AVATAR_TONES = [
  // dark-ok: цвет-категория заглушки аватара, не статус
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  // dark-ok: цвет-категория заглушки аватара, не статус
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  // dark-ok: цвет-категория заглушки аватара, не статус
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  // dark-ok: цвет-категория заглушки аватара, не статус
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  // dark-ok: цвет-категория заглушки аватара, не статус
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  // dark-ok: цвет-категория заглушки аватара, не статус
  "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
] as const;

function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Детерминированный цвет заглушки по строке-зерну (имя, id). */
export function pickAvatarTone(seed: string): string {
  return AVATAR_TONES[djb2(seed) % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}
