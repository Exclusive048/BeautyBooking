/**
 * CSRF-CONTENT-TYPE-LAYER — ЕДИНСТВЕННЫЙ реестр мест, которые читают тело
 * входящего запроса БЕЗ проверки типа содержимого
 * (`lib/http/json-content-type.ts`).
 *
 * Правило: тело читает `parseBody` (проверяет сам) либо роут, который перед
 * чтением зовёт `nonJsonBodyRefusal(req)` / `assertJsonContentType(req)`.
 * Всё остальное — запись здесь, ПОСАЙТОВО: файл + функция + сколько в ней
 * чтений. Сторож `request-body-readers.test.ts` выводит набор чтений из дерева
 * и падает на дельте в обе стороны: новое непроверенное чтение без записи и
 * запись, которой больше нечего описывать.
 *
 * Модуль — только данные; рантайм его не импортирует.
 */

export type BodyReaderKind =
  /** Файл приходит `multipart/form-data` — его умеет и обычная HTML-форма,
   *  поэтому требование типа здесь ничего не добавляет. */
  | "multipart"
  /** Внешний сервис без куки: подлинность — не сессия посетителя. */
  | "webhook"
  /** Полномочие едет В ТЕЛЕ (refresh-токен, одноразовый код), кука не читается:
   *  подделанное межсайтовое тело не несёт ничьих прав. */
  | "body-credential"
  /** Тело данных не несёт (схема — пустой объект). */
  | "ignored-body"
  /** Служебное чтение от имени вызывающего, который проверяет тип сам. */
  | "internal";

export type BodyReaderException = {
  file: string;
  /** Имя функции, в которой стоит чтение (как его видит сторож). */
  fn: string;
  /** Сколько чтений тела в этой функции. */
  reads: number;
  kind: BodyReaderKind;
  reason: string;
};

export const REQUEST_BODY_READERS: readonly BodyReaderException[] = [
  // ── Загрузка файлов (multipart) ───────────────────────────────────────
  { file: "src/app/api/bookings/upload-reference/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Фото-референс к записи — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/chat/upload-attachment/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Вложение переписки — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/master/clients/[clientKey]/card/photos/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Фото карточки клиента — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/studio/clients/[clientKey]/card/photos/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Фото карточки клиента студии — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/media/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Загрузка медиа — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/search/by-photo/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Поиск по фото — multipart, состояния не меняет." },
  { file: "src/app/api/support/tickets/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Обращение в поддержку с вложениями — multipart." },

  // ── Вебхуки ───────────────────────────────────────────────────────────
  { file: "src/app/api/payments/yookassa/webhook/route.ts", fn: "POST", reads: 1, kind: "webhook", reason: "ЮКасса: тело — подсказка, подлинность держит перезапрос объекта воркером (инв. #5); кука не читается." },
  { file: "src/app/api/telegram/webhook/route.ts", fn: "POST", reads: 1, kind: "webhook", reason: "Telegram: подлинность — секрет в заголовке, кука не читается." },

  // ── Полномочие в теле ─────────────────────────────────────────────────
  { file: "src/app/api/mobile/v1/auth/refresh/route.ts", fn: "POST", reads: 1, kind: "body-credential", reason: "Refresh-токен приложения в теле; кука не читается." },
  { file: "src/app/api/mobile/v1/auth/logout/route.ts", fn: "POST", reads: 1, kind: "body-credential", reason: "Отзывается семья refresh-токена из тела; кука не читается." },
  { file: "src/app/api/mobile/v1/auth/oauth/exchange/route.ts", fn: "POST", reads: 1, kind: "body-credential", reason: "Одноразовый код + PKCE-verifier приложения в теле; кука не читается." },

  // ── Тело без данных ───────────────────────────────────────────────────
  { file: "src/app/api/profiles/master/route.ts", fn: "POST", reads: 1, kind: "ignored-body", reason: "Схема — пустой объект (`emptyBodySchema`): подделывать нечего, а отказ по типу сломал бы POST без тела." },
  { file: "src/app/api/profiles/studio/route.ts", fn: "POST", reads: 1, kind: "ignored-body", reason: "Схема — пустой объект (`emptyBodySchema`): подделывать нечего, а отказ по типу сломал бы POST без тела." },

  // ── Служебные чтения ──────────────────────────────────────────────────
  { file: "src/lib/http/body-limit.ts", fn: "readBodyTextCapped", reads: 2, kind: "internal", reason: "Читает поток от имени вызывающего; сами вызовы `readBodyTextCapped` сторож проверяет у вызывающих." },
  { file: "src/lib/validation/index.ts", fn: "parseOptionalBody", reads: 1, kind: "internal", reason: "Тело, которое можно не присылать: читает с границей, пустое разбирает как `{}` без требования типа (данных нет — подделывать нечего), непустое — только после `assertJsonContentType`." },
];
