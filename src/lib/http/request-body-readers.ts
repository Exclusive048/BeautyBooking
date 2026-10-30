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
  /** Роут намеренно принимает HTML-форму (`urlencoded` / `multipart`). */
  | "form"
  /** Внешний сервис без куки: подлинность — не сессия посетителя. */
  | "webhook"
  /** Полномочие едет В ТЕЛЕ (refresh-токен, одноразовый код), кука не читается:
   *  подделанное межсайтовое тело не несёт ничьих прав. */
  | "body-credential"
  /** Тело данных не несёт (схема — пустой объект). */
  | "ignored-body"
  /** Служебное чтение от имени вызывающего, который проверяет тип сам. */
  | "internal"
  /** Не переведено: файл в зоне другой задачи. Перевод — BACKLOG
   *  `CSRF-CONTENT-TYPE-DIRECT-READS`. */
  | "pending";

export type BodyReaderException = {
  file: string;
  /** Имя функции, в которой стоит чтение (как его видит сторож). */
  fn: string;
  /** Сколько чтений тела в этой функции. */
  reads: number;
  kind: BodyReaderKind;
  reason: string;
};

const PENDING_ADMIN =
  "Админский роут: тело читается сам роутом. Клиент админки шлёт JSON с типом; " +
  "перевод на nonJsonBodyRefusal — вместе с остальными админскими роутами (другая задача волны).";

export const REQUEST_BODY_READERS: readonly BodyReaderException[] = [
  // ── Загрузка файлов (multipart) ───────────────────────────────────────
  { file: "src/app/api/bookings/upload-reference/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Фото-референс к записи — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/chat/upload-attachment/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Вложение переписки — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/master/clients/[clientKey]/card/photos/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Фото карточки клиента — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/studio/clients/[clientKey]/card/photos/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Фото карточки клиента студии — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/media/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Загрузка медиа — multipart; защита — слои 1–2 и проверка байтов (SEC-06)." },
  { file: "src/app/api/search/by-photo/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Поиск по фото — multipart, состояния не меняет." },
  { file: "src/app/api/support/tickets/route.ts", fn: "POST", reads: 1, kind: "multipart", reason: "Обращение в поддержку с вложениями — multipart." },

  // ── Намеренные HTML-формы ─────────────────────────────────────────────
  { file: "src/app/api/auth/roles/add/route.ts", fn: "readBody", reads: 3, kind: "form", reason: "Принимает и JSON, и форму (urlencoded/multipart) по типу; только админ. Вызывающих в src/ и .qa нет — снятие формы решается в зоне auth." },
  { file: "src/app/api/auth/account-type/set/route.ts", fn: "readBody", reads: 3, kind: "form", reason: "Принимает и JSON, и форму по типу. Вызывающих в src/ и .qa нет — снятие формы решается в зоне auth." },

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
  { file: "src/features/admin-cabinet/reports/server/decision-route.ts", fn: "parseOptionalBody", reads: 1, kind: "internal", reason: "Смотрит только, пусто ли тело («Отклонить» без пометки); непустое уходит в `parseBody`, который проверяет тип." },

  // ── Не переведено (зона других задач) ────────────────────────────────
  { file: "src/app/api/admin/app-settings/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/billing/plans/[id]/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/billing/refund/route.ts", fn: "POST", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/billing/subscriptions/[id]/cancel/route.ts", fn: "POST", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/catalog/categories/route.ts", fn: "POST", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/catalog/categories/[id]/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/catalog/categories/[id]/reject/route.ts", fn: "POST", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/cities/route.ts", fn: "POST", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/cities/[id]/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/cities/[id]/merge/route.ts", fn: "POST", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/reviews/[id]/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/reviews/[id]/delete/route.ts", fn: "POST", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/system-config/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/admin/users/[id]/plan/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: PENDING_ADMIN },
  { file: "src/app/api/auth/otp/request/route.ts", fn: "POST", reads: 1, kind: "pending", reason: "Выпуск кода входа (зона auth): сессию не читает, но перевод — вместе с проверкой кода." },
  { file: "src/app/api/auth/otp/email/request/route.ts", fn: "POST", reads: 1, kind: "pending", reason: "Выпуск кода входа на почту (зона auth): сессию не читает, но перевод — вместе с проверкой кода." },
  { file: "src/lib/auth/otp-login.ts", fn: "verifyPhoneOtpLogin", reads: 1, kind: "pending", reason: "Проверка кода (зона auth): общая для веба и приложения; межсайтовый вход в чужой аккаунт закрыт слоем 2 (SEC-08), слой 3 — следующим шагом." },
  { file: "src/lib/auth/otp-login.ts", fn: "verifyEmailOtpLogin", reads: 1, kind: "pending", reason: "Проверка кода с почты (зона auth): как у телефона." },
  { file: "src/app/api/cabinet/master/schedule/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: "Снапшот расписания (зона заявок на расписание)." },
  { file: "src/app/api/studio/schedule/requests/[id]/reject/route.ts", fn: "POST", reads: 1, kind: "pending", reason: "Отказ по заявке на расписание (зона заявок на расписание)." },
  { file: "src/app/api/media/[id]/crop/route.ts", fn: "PATCH", reads: 1, kind: "pending", reason: "Обрезка фото (зона медиа-библиотеки)." },
  { file: "src/app/api/log-error/route.ts", fn: "POST", reads: 1, kind: "pending", reason: "Отчёт об ошибке клиента (зона журнала ошибок): аноним, состояния пользователя не меняет." },
];
