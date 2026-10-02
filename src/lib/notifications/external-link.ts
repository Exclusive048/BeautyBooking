import { resolvePublicAppUrl } from "@/lib/app-url";

/**
 * EXTERNAL-LINK-NO-IDS (2026-10-02, решение владельца; VK-LINK-NO-IDS + письма) —
 * ссылка, уходящая во ВНЕШНИЙ канал (сообщение ВКонтакте, письмо), не несёт
 * внутренних идентификаторов.
 *
 * Центр уведомлений и пуш получают «глубокую» ссылку (`?focus=<id записи>`,
 * `?applicationId=…`, `?filterOffer=…`, `?c=<ключ переписки>`). Сама по себе она
 * доступа не даёт — страница требует входа и показывает только своё, — но текст
 * сообщения ВКонтакте хранит ВКонтакте, а письмо — почтовые сервисы, то есть
 * третьи стороны, и внутренним id там не место (то же, что rule 12 для
 * публичных API).
 *
 * Поэтому от адреса остаётся только раздел: путь без query и без `#`, плюс
 * параметры из короткого списка заведомо безобидных (вид и день календаря,
 * время горящего окошка). Путь с сегментом, похожим на внутренний id, ссылки не
 * получает вовсе. Чужой домен — тоже: из внешнего канала ведём только на свой
 * сайт. Список — разрешающий: новый параметр во внешний канал не уйдёт, пока его
 * сюда не внесут осознанно.
 */
export const EXTERNAL_LINK_ALLOWED_PARAMS: ReadonlySet<string> = new Set([
  // Календарь студии: какой вид и какой день салона открыть.
  "view",
  "date",
  // Горящее окошко: время слота на публичной странице записи.
  "slotStartAt",
  // Каталог горящих окошек.
  "hot",
]);

/** CUID (`c` + 24 символа) и непрозрачный публичный id (`e_…`) — внутренние идентификаторы. */
const ID_LIKE_SEGMENT = /^(c[a-z0-9]{20,}|e_[A-Za-z0-9_-]+)$/;

/** Абсолютная ссылка на свой сайт без внутренних id либо `null` — ссылки не будет. */
export function toExternalSafeLink(url: string | undefined): string | null {
  if (!url) return null;
  const base = resolvePublicAppUrl();
  if (!base) return null;

  let parsed: URL;
  let origin: URL;
  try {
    origin = new URL(base);
    parsed = new URL(url, origin);
  } catch {
    return null;
  }
  if (parsed.origin !== origin.origin) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.some((segment) => ID_LIKE_SEGMENT.test(decodeURIComponent(segment)))) return null;

  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (EXTERNAL_LINK_ALLOWED_PARAMS.has(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return `${origin.origin}${parsed.pathname}${query ? `?${query}` : ""}`;
}
