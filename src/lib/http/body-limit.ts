/**
 * SEC-16 — верхняя граница размера тела запроса.
 *
 * До этого тело разбиралось без каких-либо ограничений: `req.json()` буферизует
 * ровно столько, сколько прислали, а Zod ограничивает поля только ПОСЛЕ разбора.
 * `next.config.ts` лимита не задаёт (`serverActions.bodySizeLimit` к Route
 * Handlers не применяется), поэтому один дешёвый запрос покупал произвольную
 * работу по памяти и CPU.
 *
 * Два слоя, по образцу CSRF-защиты (SEC-08):
 *
 *   1. `exceedsDeclaredBodyLimit` — чистая проверка ЗАЯВЛЕННОГО размера
 *      (`Content-Length`). Стоит в `src/proxy.ts` и отсекает честно объявленный
 *      перебор ДО входа в обработчик, не прочитав ни байта.
 *   2. `readBodyTextCapped` — фактический счётчик байтов на потоке. Нужен
 *      отдельно, потому что `Content-Length` может отсутствовать (chunked) или
 *      лгать; слой 1 без него — вежливая просьба, а не ограничение.
 *
 * Модуль намеренно без импортов: его тянет middleware-бандл (`src/proxy.ts`),
 * а бросающие обёртки живут там, где уже есть `AppError` (`lib/validation`).
 */

/**
 * 1 МБ. Планка выбрана заведомо выше любого продуктового тела: самый крупный
 * JSON в проекте — снапшот расписания (недельный шаблон + исключения), это
 * десятки килобайт, а base64 в JSON-телах нет вообще (файлы идут multipart'ом).
 * Смысл планки не в том, чтобы быть тесной, а в том, чтобы стоимость запроса
 * перестала быть неограниченной сверху.
 */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

/**
 * multipart исключён намеренно: загрузки легитимно крупнее (10 МБ у медиа), и
 * у них своя проверка размера в роутах. Всё остальное (включая `text/plain`,
 * которым можно замаскировать JSON) считается по общей планке — `req.json()`
 * на content-type не смотрит, и гейт не должен тоже.
 */
function isStreamedUpload(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes("multipart/form-data");
}

export function exceedsDeclaredBodyLimit(input: {
  contentType?: string | null;
  contentLength: string | null;
  maxBytes?: number;
}): boolean {
  if (isStreamedUpload(input.contentType ?? null)) return false;

  const raw = input.contentLength;
  if (!raw) return false;

  const declared = Number.parseInt(raw, 10);
  if (!Number.isFinite(declared)) return false;

  return declared > (input.maxBytes ?? MAX_JSON_BODY_BYTES);
}

export type CappedBodyRead =
  | { ok: true; text: string }
  | { ok: false; reason: "too-large" };

/**
 * Читает тело как текст, обрывая чтение на превышении планки.
 *
 * Возвращает результат, а не бросает: у трёх вызывающих (`parseBody`,
 * `/api/log-error`, `/api/support/partnership`) три разные формы ответа, и
 * примитив не должен выбирать за них.
 */
export async function readBodyTextCapped(
  req: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<CappedBodyRead> {
  if (
    exceedsDeclaredBodyLimit({
      contentType: req.headers.get("content-type"),
      contentLength: req.headers.get("content-length"),
      maxBytes,
    })
  ) {
    return { ok: false, reason: "too-large" };
  }

  const stream = req.body;
  if (!stream) {
    // Тела нет либо рантайм не отдаёт его потоком. Заявленный размер уже
    // проверен выше — читаем как есть.
    return { ok: true, text: await req.text() };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      // Обрываем соединение: дочитывать то, что уже признано лишним, — ровно
      // та работа, которую находка и просит не делать.
      await reader.cancel();
      return { ok: false, reason: "too-large" };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(merged) };
}
