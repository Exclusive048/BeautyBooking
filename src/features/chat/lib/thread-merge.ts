import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { ThreadItemDto, ThreadMessageDto } from "@/features/chat/types";

/**
 * 29.09 доработки · 31 (решение 31.4) — склейка загруженных страниц переписки.
 *
 * Переписка приходит страницами по 100 сообщений, а свежая страница
 * перезапрашивается на каждое новое сообщение. Заменять ленту ответом
 * нельзя: окно «последние 100» сдвигается вперёд, и между уже загруженными
 * ранними страницами и новой свежей появилась бы дыра. Поэтому лента —
 * объединение всего загруженного: сообщения по `id` (более поздний ответ
 * побеждает — у него свежий `readAt`), порядок `(createdAt, id)` — тот же,
 * что у курсора сервера, разделители дней — заново по часам зрителя (как их
 * ставит сервер, `injectDaySeparators`): иначе на стыке страниц один день
 * получил бы два разделителя с одинаковым ключом.
 */
export function mergeThreadItems(
  loaded: readonly ThreadItemDto[],
  incoming: readonly ThreadItemDto[],
  timezone: string,
): ThreadItemDto[] {
  const byId = new Map<string, ThreadMessageDto>();
  for (const item of loaded) if (item.type === "message") byId.set(item.id, item);
  for (const item of incoming) if (item.type === "message") byId.set(item.id, item);

  const messages = [...byId.values()].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const out: ThreadItemDto[] = [];
  let lastKey: string | null = null;
  for (const message of messages) {
    const key = toLocalDateKey(new Date(message.createdAt), timezone);
    if (key !== lastKey) {
      out.push({ type: "day_separator", id: `day-${key}`, dateKey: key });
      lastKey = key;
    }
    out.push(message);
  }
  return out;
}
