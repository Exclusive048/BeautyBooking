# AUDIT-FRESH-03 — Устойчивость, режимы отказа, fallback'и — Отчёт

> Дата: **2026-08-04** · Ветка: **`main`**, чистое рабочее дерево · Режим: **READ-ONLY**
> Единственный созданный файл — этот. `BACKLOG.md` не тронут (предложенные строки — в отдельной секции ниже).

---

## Метод (что осмотрено, какие команды/grep'ы прогнаны)

**Прочитано целиком:** `src/lib/env.ts`, `src/lib/redis/connection.ts`, `src/lib/rate-limit/index.ts`, `src/lib/queue/queue.ts`, `src/worker.ts`, `src/lib/cache/{cache,redisClient}.ts`, `src/lib/idempotency/idempotency.ts`, `src/lib/bookings/{idempotency,slot-invalidation}.ts`, `src/lib/ai/client.ts`, `src/lib/visual-search/provider.ts`, `src/lib/notifications/{notifier,push/send}.ts`, `src/lib/monitoring/{alert,alerts,index}.ts`, `src/lib/logging/logger.ts`, `src/lib/email/sender.ts`, `src/lib/sms/{index,smsc-provider}.ts`, `src/lib/prisma{,-direct}.ts`, `src/lib/api/{response,with-request-context}.ts`, `src/instrumentation.ts`, `src/lib/startup.ts`, `src/proxy.ts`, `docker-compose.prod.yml`, `Dockerfile.worker`, `scripts/check-worker-boot.mjs`, `.github/workflows/deploy.yml`, `docs/runbooks/redis-down.md`.

**Роуты:** `/api/health`, `/api/health/worker`, `/api/health/status`, `/api/notifications/stream`, `/api/billing/renew/run`, `/api/billing/mrr/snapshot/run`, `/api/catalog/available-today/run`, `/api/payments/yookassa/webhook`, `/api/auth/otp/request`, `/api/auth/otp/email/request`, `/api/public/providers/[providerId]/slots`.

**Прогнанные проверки (доказательная база):**
```
grep -rn "process\.on(" src/ scripts/                      → 4 хита, все в src/worker.ts
grep -rln "getRedisConnection" src/    vs
grep -rln "withRedisCommandTimeout" src/                   → дельта = 6 файлов (RES-01/09)
grep -rn "scheduleBookingReminders" src/                   → 4 call-site'а, 1 незащищённый
find src/app/api -name route.ts | wc -l                    → 288
for f in $(find src/app/api -name route.ts); do grep -q catch || echo; done | wc -l → 18
node -e "require('./node_modules/redis/package.json').version"  → 5.10.0
sed -n '149,215p' node_modules/next/dist/server/next-server.js  → installProcessErrorHandlers
sed -n '435,460p;628,650p' node_modules/@redis/client/dist/lib/client/index.js
```

**Три параллельных под-обхода** (все read-only): инвентарь `error.tsx`/`loading.tsx`/`not-found.tsx` по route-группам; сплошной свип всех исходящих `fetch(`/SDK-вызовов на предмет таймаутов; аудит клиентских fallback'ов (изображения, тосты, empty states, offline, SSE). Ключевые находки каждого перепроверены мной вручную по исходникам — цитаты ниже мои, из файлов.

**Не делалось:** нагрузочные прогоны, обращения к живым внешним API, git-мутации, запуск приложения.

---

## Матрица отказов зависимостей

Легенда: **✅** — есть · **⚠️** — частично/условно · **❌** — нет.

| Зависимость | Таймаут задан? (значение, где) | Политика ретраев | Circuit / short-circuit? | Fallback для пользователя | Радиус поражения при отказе |
|---|---|---|---|---|---|
| **Postgres** | ⚠️ Только дефолты Prisma (connect 5 c, pool 10 c). `statement_timeout` **не задан** ни в URL, ни на сервере — `.env.production.example:27` не несёт параметров пула. `src/lib/prisma.ts:9` — только `log` | ❌ Нет | ❌ Нет | ❌ Нет — `/api/health` вернёт 503, страницы упадут в error boundary (там, где он есть) | **Тотальный.** Все флоу. Один патологический запрос держит слот пула до бесконечности |
| **Redis** | ⚠️ **Расщеплено.** `connection.ts:15-16` — connect 3 c, command 2.5 c через `withRedisCommandTimeout`. Но обёрткой пользуются только 8 файлов; **`lib/cache/redisClient.ts`, `lib/auth/otp-rate-limit.ts`, `lib/notifications/notifier.ts`, оба health-роута — нет** (RES-01/09) | ⚠️ `reconnectStrategy(retries) => min(retries*100, 2000)` — **бесконечно**, отказа не наступает | ⚠️ Fail-closed для sensitive-префиксов (`rate-limit/index.ts:22-51`); fail-open/memory для остальных. Для **кэша** — короткого замыкания нет | ⚠️ Rate-limit → 429 с `Retry-After`; кэш → «промах» (пересчёт из БД) — **только если команда вернулась**. При зависании — ожидание без границы | **Широкий.** Слоты/booking-days/каталог/план биллинга/идемпотентность броней/`users/me`. Очередь в проде — hard-fail (`queue.ts:21,46`) |
| **YandexGPT (chat)** | ✅ **15 c** — `ai/client.ts:47` `AI_TIMEOUT_MS`, `:165` `AbortSignal.timeout(...)` | ✅ 1 повтор с классификатором `isRetryable` (`:85-96`), sleep 1 c | ✅ Возврат `null` вместо throw (`:186-188`); 402/429 → Telegram-алерт с cooldown | ✅ Поверхность просто не показывает AI-блок | **Только AI-поверхности** (review-summary / review-reply / service-description / advisor). Бронирование и поиск не затронуты — проверено: `aiChat` не импортируется ни из `bookings/*`, ни из `catalog/*` |
| **qwen (visual search)** | ✅ **30 c** — `visual-search/provider.ts:40,186` | ⚠️ Инлайн-ретраев нет; классификатор `isRetryableProviderError` (`:299`) отдан очереди (`indexer.ts`) | ✅ Возврат `null`, `logProviderFailure` | ✅ Фича dormant (`VISUAL_SEARCH_ENABLED=false`, 0 векторов) | **Нулевой сегодня.** При включении — только индексация/визуальный поиск |
| **Yandex embeddings** | ✅ **30 c** — `provider.ts:41,263` `AbortSignal.timeout` | ⚠️ Через очередь | ✅ `null` + лог | ✅ dormant | Как выше |
| **YooKassa API (исходящий)** | ✅ **10 c** — `payments/yookassa/client.ts:94` и `:217`, `AbortController` + `setTimeout(...,10_000)`; abort → `AppError("Payment service timeout", 503, "PAYMENT_TIMEOUT")` | ⚠️ Инлайн нет; для webhook re-fetch — ретраи очереди (до 3 → dead-letter) | ✅ 503 наружу, `Idempotence-Key` делает повтор безопасным | ⚠️ Checkout: сообщение об ошибке. **Строка `BillingPayment` со статусом `PENDING`/`FAILED` остаётся** — см. RES-24 | Оплата/продление. Доступ не теряется (grace) |
| **YooKassa webhook (входящий)** | n/a | ✅ **Правильно:** enqueue-fail → 503 (`webhook/route.ts:144`), YooKassa ретраит в своём 24-часовом окне | ✅ Pre-filter по `?token=`; подлинность — worker re-fetch (инв. #5) | ✅ Пользователь ничего не видит | Отложенная активация подписки. Восстанавливается сам |
| **Object Storage / медиа (S3)** | ❌ **Нет.** `media/storage/s3.ts:59` — `new S3Client({endpoint, region, forcePathStyle, credentials})`, ни `requestHandler`, ни `requestTimeout`/`connectionTimeout` | ⚠️ Только неявный `maxAttempts: 3` AWS SDK | ❌ Нет | ✅ **На чтении — отлично:** `components/ui/resilient-image.tsx` (119 call-site'ов в 50 файлах) даёт `onError` → CSS-плейсхолдер, без layout shift. На **записи** — фидбэка нет (RES-12) | Загрузка портфолио/аватаров; `media.purge` (удаление ПДн) — падает в ретраи очереди, это осознанно (`worker.ts:537-543`) |
| **Геокодер / Suggest** | ❌ **Нет.** `app/api/address/geocode/route.ts:58` — `fetch(url, { cache: "no-store" })`; `cities/yandex-locality.ts:98` — то же; `maps/address-suggest.ts:66` принимает **опциональный** `input.signal`, серверные вызовы его не передают | ❌ Нет | ❌ Нет | ⚠️ Не проверено поштучно; при зависании — крутящийся спиннер подсказок / зависший PATCH адреса | Сохранение адреса кабинета, детект города. Не блокирует бронирование |
| **SMS-провайдер (SMSC)** | ❌ **Нет.** `sms/smsc-provider.ts:164` — `await fetchImpl(url, { method: "GET" })` | ❌ Нет | ✅ `sendOtpSms` «никогда не бросает»; роут fail-soft → 503 `SMS_DELIVERY_FAILED` (`otp/request/route.ts:69-88`) | ✅ Текст «Не удалось отправить SMS. Попробуйте ещё раз через минуту.» + OTP уже в БД, повтор доставит | **Вход по телефону.** Сегодня в проде выключен (`PHONE_AUTH_ENABLED` unset ⇒ OFF) |
| **SMTP (email-OTP)** | ❌ **Нет.** `email/sender.ts:19-24` — только `host/port/secure/auth`; дефолты nodemailer: connect 2 мин, greeting 30 c, **socket 10 мин** | ❌ Нет | ⚠️ `sendEmail` не бросает (`:50-57`), но **`await` держит ответ** роута (`otp/email/request/route.ts:53`) | ⚠️ После возврата — корректное сообщение. **До возврата — до 10 минут ожидания** | **Вход в прод.** Email — единственный включённый канал входа при `PHONE_AUTH_ENABLED=OFF` |
| **web-push (VAPID)** | ❌ **Нет.** `notifications/push/send.ts:51` — `webpush.sendNotification(sub, body)` **без третьего аргумента опций** (нет `timeout`, `agent`, `TTL`) | ❌ Нет | ✅ Полностью обёрнут; **структурно не reject'ит** — подтверждаю комментарий `send.ts:17-25`: `try` покрывает и Prisma-чтения, и `Promise.all` фан-аут, per-подписка свой `catch` с удалением на 410 | ✅ Пользователь видит in-app уведомление независимо | Push-доставка. Воркер не падает |
| **Telegram (ops-алерты)** | ❌ **Нет.** `monitoring/alert.ts:68` — `fetch(...)` без `signal` | ❌ Нет (только 5-мин cooldown в `alerts.ts`) | ✅ Всё в `try/catch`, вызов через `void` из `logError` — запрос не блокируется | n/a (внутренний канал) | Само оповещение. Под error-storm — N висящих сокетов undici |
| **Telegram (user-facing)** | ✅ **5 c** — `telegram/client.ts:21`, `AbortController` | ✅ Очередь: `min(60, 2**attempts)`, до `DEFAULT_JOB_MAX_ATTEMPTS` → dead-letter | ✅ Килл-свитч `getTelegramEnabled()` дропает джобу без ретрая (`worker.ts:356`) | ✅ Канал выключен by design | Нулевой (gated OFF) |
| **GlitchTip** | ⚠️ Только `shutdownTimeout: 2000` (`observability/server.ts:122`) | SDK-внутренние | ✅ Без DSN `Sentry.init` не вызывается | ✅ Прозрачно | Фоновый транспорт, риск низкий |

**Итог по правилу «у каждого исходящего HTTP — явный таймаут»: из 18 серверных call-site'ов таймаут есть у 6.** Без таймаута: SMSC ×2, Геокодер ×2, Suggest, Telegram-ops, VK OAuth ×2, Yandex OAuth ×2, SMTP ×3 (+2 × `transporter.verify()`), S3, web-push, worker→healthcheck, `proxy.ts`→`/api/auth/refresh`, `api/server-fetch.ts`.

---

## Инвентарь поверхностей ошибок (error.tsx / loading.tsx / not-found.tsx по route-группам)

### `error.tsx` — 4 файла на 88 страниц

| Файл | UI | `reset()` | Репорт в GlitchTip | `UI_TEXT` |
|---|---|---|---|---|
| `src/app/global-error.tsx` | ✅ полный `<html>` c inline-стилями | ✅ «Обновить страницу» + «На главную» | ✅ `reportError(...)` **+** `POST /api/log-error` | ❌ строки захардкожены |
| `src/app/(public)/error.tsx` | ✅ `<ErrorState variant="default">` | ✅ | ❌ **только** `/api/log-error` | ✅ |
| `src/app/(cabinet)/error.tsx` | ✅ | ✅ | ❌ | ✅ |
| `src/app/(admin)/error.tsx` | ✅ (+ digest в тексте) | ✅ | ❌ | ✅ |

**Корневого `src/app/error.tsx` НЕТ.** Все ungrouped-роуты падают сразу в `global-error.tsx` — то есть теряют layout/навигацию целиком.

### Core-роуты БЕЗ segment-level error boundary

`/` (главная) · `/catalog` · `/login` · **`/book`** · `/pricing` · `/notifications` · `/support` · `/consent` `/privacy` `/terms` · `/403` · `/offline` · `/logout` · `/blog` `/faq` `/help` `/about` `/how-it-works` `/how-to-book` `/become-master` `/gift-cards` `/partners` `/careers`.

Покрыты: `(public)/u/[username]` и `.../booking` (второй booking-путь), весь `(cabinet)`, весь `(admin)`, публичные профили, чат (через `(cabinet)`).

### `not-found.tsx` — 4: корневой + `u/[username]` + `providers/[id]` + `models/[code]`. ✅

### `loading.tsx` — 18 файлов

Есть: `/catalog`, `(public)/models`, `u/[username]`, `u/[username]/booking`, `/admin` (корень), `cabinet/master` + 6 подстраниц, `cabinet/studio` + 4.

**Нет ни `loading.tsx`, ни `<Suspense>`:** вся группа `(user)` (11 страниц: `bookings`, `favorites`, `messages`, `reviews`, `notifications`, `profile`, `settings`, …), `/cabinet` корень, `/cabinet/billing`, все 6 подразделов `/admin/*`, `cabinet/master/{bookings,messages,portfolio,services,settings/*,account/*,billing,notifications}`, `cabinet/studio/{bookings,clients,finance,reviews,schedule-requests,settings/*}`, `(public)/providers/[id]`, `(public)/clients/[id]`.

`<Suspense>` под `src/app` — 6 файлов; из них `/pricing:76` и `/help:60` используют `fallback={null}` (пустой экран при медленной БД).

**Мусор:** `src/app/(public)/pricing/loading.tsx` — сирота: в каталоге нет `page.tsx`, живой роут — `src/app/pricing/page.tsx`, у которого `loading.tsx` нет. `src/app/(provider)/` — мёртвая route-группа (только `layout.tsx`, ни одной страницы).

---

## Находки

### P0 🔴 — нет

Ни одна найденная проблема не является безусловным крашем happy path или безусловной потерей данных. Наиболее близко подходят **RES-01/RES-04** (каскадное зависание при brownout зависимости) и **RES-11** (тихая потеря правки), но всем трём нужен внешний триггер. Списка P0 в этом обходе нет — и это утверждение, а не отсутствие проверки.

---

### P1 🟠

---

**RES-01 · Вся кэш-прослойка ходит в Redis без command-таймаута — зависание вместо деградации**
`src/lib/cache/redisClient.ts:16-24, 26-38, 40-49, 51-70` · **L**

**Доказательство.** Проект уже имеет ровно тот примитив, которого здесь не хватает:
```ts
// src/lib/redis/connection.ts:41-56
export function withRedisCommandTimeout<T>(operation, promise, timeoutMs = REDIS_COMMAND_TIMEOUT_MS) { … }
```
`grep -rln getRedisConnection` даёт 16 файлов, `grep -rln withRedisCommandTimeout` — 8. В дельте лежит `redisClient.ts`, где каждая команда голая:
```ts
// src/lib/cache/redisClient.ts:18-21
const client = await getRedisConnection();
if (!client) return null;
const raw = await client.get(key);      // ← без таймаута
```
Почему это именно зависание, а не ошибка: `redis@5.10.0`, `disableOfflineQueue` не выставлен (по умолчанию `false`), а `reconnectStrategy(retries) => Math.min(retries*100, 2000)` (`connection.ts:63-65`) **никогда не сдаётся**. В `@redis/client/dist/lib/client/index.js:639-651` `sendCommand` отклоняет промис только если `!socket.isOpen`; во время бесконечного реконнекта `isOpen` остаётся `true`, и команда просто уходит в offline-очередь. Обработчик `error` (`:445-452`) при `isOpen && !disableOfflineQueue` делает лишь `flushWaitingForReply` — уже отправленные, но не новые. Итог: промис не settle'ится **никогда**.

`getRedisConnection()` при этом вернёт живой мемоизированный клиент (`connection.ts:88-124`) — путь «клиент = null → graceful» срабатывает только если Redis лежал в момент **первого** коннекта.

**Импакт.** Потребители `lib/cache/cache.ts` — 19 модулей, включая **`schedule/slotsCache.ts` и `schedule/dayPlanCache.ts`** (ядро booking-флоу), `catalog/catalog.service.ts`, `billing/get-current-plan.ts`, `idempotency/idempotency.ts`, `users/me.ts`, `api/public/providers/[providerId]/{slots,booking-days}`. Redis-brownout (netsplit, BGSAVE-стопор, своп) = слот-пикер и каталог висят до таймаута ALB, потребляя воркеры Node. Rate-limit и очередь в этом же сценарии деградируют корректно — именно потому, что обёрнуты.

**Направление фикса.** Прогнать все команды `redisClient.ts` через `withRedisCommandTimeout("cache:<op>", …)`; таймаут-ошибку трактовать как cache-miss (для `get`/`del`/`delByPattern`) и как fail (для `setNx` — там уже throw). Дополнительно оценить `disableOfflineQueue: true` в `buildClient` — он превращает молчаливую очередь в мгновенный `ClientOfflineError`, что для кэша ровно то, что нужно.

---

**RES-02 · `notificationsNotifier` — одноразовый промис: транзиентный отказ Redis навсегда убивает in-app уведомления в процессе**
`src/lib/notifications/notifier.ts:127` · **S**

**Доказательство.**
```ts
// src/lib/notifications/notifier.ts:100-127
async function createNotifier(): Promise<NotificationNotifier> {
  const publisherClient = await getRedisConnection();
  const subscriberClient = await getRedisSubscriberConnection();
  if (!publisherClient || !subscriberClient) {
    if (!allowMemoryNotifierFallback) {                 // allowMemoryNotifierFallback = !isProduction
      notifierRuntimeStatus = { mode: "unavailable", ready: false, reason: "redis-required" };
      throw new Error("Redis is required for notifications notifier in production");
    }
    …
  }
  …
}
export const notificationsNotifier = createNotifier();   // ← вызывается РОВНО ОДИН РАЗ
```
Промис создаётся на module-eval и кэшируется навсегда. Если Redis недоступен в этот момент (рестарт Redis, гонка при деплое — `depends_on: condition: service_healthy` спасает только первый старт, не последующие рестарты Redis), промис остаётся **отклонённым до конца жизни процесса**. Восстановление Redis ничего не меняет: `createNotifier` больше не вызывается, `notifierRuntimeStatus` больше не пересчитывается.

**Runbook уже расходится с кодом.** `docs/runbooks/redis-down.md`, раздел «Как понять, что инцидент устранён», п. 3: `data.notifier.mode = "redis"`, `data.notifier.ready = true`. По коду это условие после восстановления Redis **не выполнится никогда** без рестарта контейнера `app` — дежурный будет ждать сигнала, которого не будет.

**Импакт.** SSE `/api/notifications/stream` отдаёт 503 `NOTIFIER_UNAVAILABLE` (`stream/route.ts:113-121`) для всех пользователей; `publish` не работает. Колокольчик замирает (см. RES-22 — деградация не показывается). In-app уведомления — единственный всегда-включённый канал (Telegram gated OFF, push опционален).

**Направление фикса.** Заменить eager-константу ленивым `getNotifier()` с ретраем: при отклонённом/`unavailable` состоянии — пересоздавать, но не чаще чем раз в N секунд (чтобы не долбить Redis на каждый SSE-коннект). Плюс тест «после первого отказа следующий вызов пробует снова».

---

**RES-03 · `createBooking`: незащищённый post-commit `scheduleBookingReminders` — бронь создана, пользователь видит 500**
`src/lib/bookings/createBooking.ts:284-286` (+ `createClientBooking.ts:262-264`) · **S**

**Доказательство — асимметрия с соседним файлом.** В `confirmBooking.ts` тот же вызов обёрнут:
```ts
// src/lib/bookings/confirmBooking.ts:219-226
try {
  await scheduleBookingReminders(updated.id);
} catch (error) {
  logError("Failed to schedule booking reminders", { bookingId: updated.id, … });
}
```
В `createBooking.ts` — нет:
```ts
// src/lib/bookings/createBooking.ts:284-286  (после коммита транзакции, строка 266)
if (shouldAutoConfirm) {
  await scheduleBookingReminders(created.id);
}
```
`scheduleBookingReminders` → `enqueue()` (`reminders.ts:82-97`), а `enqueue` в проде при недоступном Redis **бросает**:
```ts
// src/lib/queue/queue.ts:21,42-47
const allowMemoryQueueFallback = !isProduction;
async function getQueueRedisConnection(operation) {
  const client = await getRedisConnection();
  if (client) return client;
  if (allowMemoryQueueFallback) return null;
  throw createQueueRedisRequiredError(operation);   // прод
}
// :205-210 — enqueue логирует и ре-throw'ит
```
Исключение поднимается через внешний `catch` (`createBooking.ts:315-320`, который только чистит идемпотентность и ре-throw'ит) в роут → 500. **Бронь при этом уже в БД.**

**Почему сценарий реален, а не теоретичен.** Полностью лежащий Redis отсечёт запрос раньше — `rate:createBooking:` в `SENSITIVE_KEY_PREFIXES` (`rate-limit/index.ts:36`) даёт fail-closed 429. Окно открывается при **мигающем** Redis: rate-limit прошёл на живом соединении, а `enqueue` попал в разрыв (или в `withRedisCommandTimeout` 2.5 c на `rPush`).

**Импакт.** Клиент видит «Не удалось создать запись», жмёт «ещё раз». Если `x-idempotency-key` отправлен — вернётся кэшированная бронь (спасает `storeBookingIdempotency` строкой 277, до падения). Гостевой виджет и мобильные клиенты, не шлющие ключ, создадут **вторую бронь**. Плюс напоминания 24 ч/2 ч для первой брони не назначаются никогда (см. RES-14).

**Направление фикса.** Обернуть строку 285 (и `createClientBooking.ts:263`) тем же `try/catch` + `logError`, что в `confirmBooking.ts`. Напоминание — не корректностный гейт: бронь уже валидна.

---

**RES-04 · `proxy.ts` делает self-fetch в `/api/auth/refresh` без таймаута на каждом запросе с протухшим access-токеном**
`src/proxy.ts:198-208` · **S**

**Доказательство.**
```ts
// src/proxy.ts:198-208
const refreshUrl = new URL(REFRESH_ENDPOINT_PATH, request.url);
const refreshRes = await fetch(refreshUrl.toString(), {
  method: "POST",
  headers: { cookie: request.headers.get("cookie") ?? "" },
});
```
Ни `signal`, ни `AbortSignal.timeout`. Матчер (`proxy.ts:288-291`) покрывает всё, кроме статики, — то есть путь горячий. Access-токен живёт 2 ч, значит каждый залогиненный пользователь регулярно проходит именно сюда.

Усугубляющий фактор: `/api/auth/refresh` — один из 18 роутов **без единого `catch`** (проверено: `for f in $(find src/app/api -name route.ts); do grep -q catch "$f" || echo "$f"; done`).

**Импакт — каскад.** Если `/api/auth/refresh` начинает тормозить (исчерпан пул Prisma — а `statement_timeout` не задан, см. RES-25), middleware блокирует **входящий** запрос в ожидании **исходящего к самому себе**. Каждый такой запрос занимает два слота обработки вместо одного. Система не восстанавливается сама, пока идёт трафик: чем больше висит, тем меньше свободных слотов для того самого `/api/auth/refresh`. Без таймаута петлю нечем разорвать.

**Направление фикса.** `signal: AbortSignal.timeout(2000)` + `try/catch` вокруг; при таймауте — продолжать без refresh (пользователь получит 401 от роута и уйдёт на `/login`, что корректнее зависания). Отдельно — рассмотреть локальную ротацию без HTTP-хопа.

---

**RES-05 · SMTP без таймаутов, `await sendEmail` держит ответ — на единственном включённом в проде канале входа**
`src/lib/email/sender.ts:19-24` + `src/app/api/auth/otp/email/request/route.ts:53` · **S**

**Доказательство.**
```ts
// src/lib/email/sender.ts:19-24
return nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});
```
Ни `connectionTimeout`, ни `greetingTimeout`, ни `socketTimeout`. Дефолты nodemailer: connect 2 мин, greeting 30 c, **socket 10 мин**. И вызов инлайновый: `const sent = await sendEmail({...})` — `otp/email/request/route.ts:53`.

Тот же паттерн, с дополнительным `await transporter.verify()` **до** отправки: `src/app/api/support/tickets/route.ts:330,356` и `src/app/api/support/partnership/route.ts:192,232`.

**Импакт.** `PHONE_AUTH_ENABLED` в проде по умолчанию OFF (`env.ts:549-553`), OAuth-кнопки гейтятся своими флагами — значит **email-OTP это тот самый и единственный вход**. Зависший SMTP = кнопка «Получить код» крутится до 10 минут, пользователь уходит. `MASTERRYADOM_AI_CONTEXT.md` §9 уже фиксирует, что «`await sendEmail` держит ответ» и что без mailpit холодный логин стоил ~21 c — то есть путь измерен, но граница не поставлена.

**Направление фикса.** `connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 10_000` в обоих транспортах + убрать `verify()` из горячего пути support-роутов. Опционально — отдавать 200 сразу и слать письмо через очередь, но тогда UI должен перестать переключать шаг по ответу.

---

**RES-06 · Core-роуты без error boundary: белый экран вместо страницы**
`src/app/` — отсутствуют `error.tsx` для `/`, `/catalog`, `/login`, `/book`, `/pricing`, `/notifications` · **M**

**Доказательство.** Всего 3 сегментных boundary — `(public)`, `(cabinet)`, `(admin)`. Корневого `src/app/error.tsx` нет. Значит серверная ошибка на любом ungrouped-роуте (а это главная, каталог, логин, `/book`, `/pricing`, `/notifications` и все статические страницы) уходит прямиком в `src/app/global-error.tsx`, который заменяет **весь документ**: своя `<html>`/`<body>`, инлайновые стили, ни навигации, ни футера, ни `UI_TEXT`.

Отдельно: `/book` — это второй, самостоятельный booking-вход (`src/app/book/page.tsx` + `book-client.tsx`); первый (`(public)/u/[username]/booking`) прикрыт `(public)/error.tsx`. Один и тот же флоу защищён по-разному.

**Импакт.** Один упавший SSR-запрос на главной/каталоге → пользователь видит голую страницу «Что-то пошло не так» вместо частичной деградации внутри layout'а.

**Направление фикса.** Добавить `src/app/error.tsx` (тот же `<ErrorState>` + `UI_TEXT`, что в `(public)/error.tsx`) — одним файлом закрывается весь ungrouped-хвост. `global-error.tsx` остаётся страховкой на отказ самого корневого layout'а.

---

**RES-07 · Auto-save профиля: сетевой сбой оставляет статус «сохраняется» навсегда и молча теряет правку**
`src/features/master/components/profile/editable/editable-field-row.tsx:63-72` + `use-autosave.ts:63-101` · **S**

**Доказательство.** Save-функция не ловит throw:
```ts
// editable-field-row.tsx:63-72
const autosave = useAutosave<string>(async (next) => {
  const normalized = normalize ? normalize(next) : next;
  const response = await fetch(apiPath, { method: "PATCH", … });   // ← throw при offline
  if (!response.ok) return { ok: false };
  return { ok: true };
});
```
`performSave` тоже не ловит — `finally` только чистит ref:
```ts
// use-autosave.ts:83-90
inFlightRef.current = promise;
try { await promise; }
finally { if (inFlightRef.current === promise) inFlightRef.current = null; }
```
И вызывается через `void`:
```ts
// use-autosave.ts:96-103
timerRef.current = setTimeout(() => { timerRef.current = null; void performSave(value); }, debounceMs);
```

**Импакт.** `setStatus("saving")` уже выполнен (`:69`), ветка `setStatus("error")` (`:79-82`) недостижима при throw. Чип навсегда в «сохраняется», правка не ушла, пользователь уверен, что всё в порядке. Это тихая потеря пользовательских данных на одном сетевом дребезге.

**Направление фикса.** `try/catch` вокруг `fetch` в save-функции → `return { ok: false, message: … }`; независимо — `catch` в `performSave`, чтобы ни один save-callback не мог оставить состояние подвешенным.

---

### P2 🟡

---

**RES-08 · SMSC без таймаута на пути выпуска OTP** — `src/lib/sms/smsc-provider.ts:164,187`: `await fetchImpl(url, { method: "GET" })`, ни `signal`, ни ретраев; вызов инлайновый (`otp/request/route.ts:68`). Fail-soft отрабатывает **после** возврата — а возврата может не быть. Сегодня P2 только потому, что `PHONE_AUTH_ENABLED` в проде OFF. **В момент включения телефонного входа это P1** — записать в тот же чеклист, что и «пополнить баланс SMSC». **S**

**RES-09 · OAuth-обмены (VK / Yandex) без таймаута** — `src/lib/vk/oauth.ts:144,184`, `src/lib/yandex/oauth.ts:117,154`. Callback залипает на code-exchange/профиле; пользователь остаётся на белой странице редиректа без возможности отменить. **S**

**RES-10 · Геокодер и Suggest без таймаута в request-path** — `src/app/api/address/geocode/route.ts:58`, `src/lib/cities/yandex-locality.ts:98` (оба `fetch(url, { cache: "no-store" })`), `src/lib/maps/address-suggest.ts:66` (`signal: input.signal` — опциональный, серверные вызовы ничего не передают). Держит сохранение адреса кабинета и авто-детект города. **S**

**RES-11 · `otp-rate-limit.ts` ходит в Redis без command-таймаута** — `src/lib/auth/otp-rate-limit.ts:52-58,60-66` и далее: `client.incr`, `client.expire`, `client.ttl`, `client.set`, `client.del` — все голые. Тот же механизм зависания, что в RES-01, но на пути входа: `checkOtpRequestRateLimit` вызывается **до** всего остального (`otp/request/route.ts:37`). Обёртывать в `withRedisCommandTimeout`; таймаут трактовать как уже существующую ветку `RATE_LIMIT_UNAVAILABLE` (503) — она корректна. **S**

**RES-12 · Загрузка портфолио: `try/finally` без `catch`** — `src/features/master/components/portfolio/modals/upload-modal.tsx:124-186`. HTTP-ошибки покрыты (`:131,144,150,164`), но обрыв сети посреди загрузки большого файла — самый вероятный сценарий — уходит необработанным rejection'ом из `onClick`. `finally` гасит спиннер, `error` остаётся `null`: модалка открыта, очередь на месте, объяснений ноль. Плюс на частичном провале батча `return` после `setProgressDone(succeeded)` не говорит, какие файлы прошли. **S**

**RES-13 · `/api/public/providers/[providerId]/slots` и `.../booking-days` без `try/catch`** — оба в списке 18 роутов без `catch`. Неожиданный throw (ошибка Prisma, битая tz) даёт дефолтный 500 Next без JSON-конверта `{ ok:false, error:{...} }`, который клиент разбирает. Слот-пикер получает нераспарсиваемый ответ. Это ядро booking-флоу. **S**

**RES-14 · Напоминания о брони существуют только в очереди — восстановления нет** — `scheduleBookingReminders` вызывается ровно в трёх местах (`createBooking.ts:285`, `confirmBooking.ts:221`, `createClientBooking.ts:263`), все — в момент мутации. Ни периодического свипа, ни выборки «CONFIRMED-брони на завтра без запланированного напоминания». Redis настроен с `--appendonly yes` (`docker-compose.prod.yml:124`) — это хорошо и заметно снижает риск, но `appendfsync everysec` по умолчанию оставляет окно ≤1 c, а любой ручной `FLUSHALL`/пересоздание тома теряет всё безвозвратно. Строка `Booking` — источник истины, из которого напоминания **можно** переroдить, но никто этого не делает. **M**

**RES-15 · Пакетные брони не планируют напоминания вообще** — `grep -n scheduleBookingReminders src/lib/bookings/package-booking*.ts` → 0 хитов, при том что `package-booking.ts:523` создаёт брони со `status: shouldAutoConfirm ? "CONFIRMED" : "PENDING"`. Клиент, купивший пакет из N услуг, не получит ни одного напоминания 24 ч/2 ч. Это не отказ инфраструктуры, а систематически недосозданная джоба — но пользовательский эффект тот же, что от «потерянной» задачи. **S**

**RES-16 · Нет `stop_grace_period` — SIGTERM убивает воркер через 10 c** — `grep stop_grace_period docker-compose.prod.yml` → пусто, значит docker-дефолт 10 c. Цикл воркера проверяет `isShuttingDown` только на витке (`worker.ts:689`), а после выхода делает `await flushReports(2000)` (`:729`). Длинная джоба (`media.purge` пачки объектов, `mrr.snapshot`, `plan-edited` масс-рассылка) получит SIGKILL. **Потери нет** — джоба остаётся в `queue:processing`, и `recoverStuckJobs` подберёт её по staleness (`queue.ts:19` — 5 мин), — но каждый деплой добавляет до 5 минут задержки и один лишний attempt. То же для `app`: 10 c на добивание in-flight запросов. **S**

**RES-17 · Boundary `(public)`/`(cabinet)`/`(admin)` не репортят в GlitchTip** — три сегментных `error.tsx` шлют только `POST /api/log-error`, а `src/app/api/log-error/route.ts` вызывает `logError` и ничего не форвардит в трекер. `reportError` во всём App Router встречается **один раз** — в `global-error.tsx`. Значит ошибки, пойманные сегментными boundary (то есть всё, что падает в кабинетах и на публичных профилях), в GlitchTip не попадают — только `onRequestError` для того, что вылетело из роут-хендлера, и `fail()` для явных 5xx. Дыра ровно там, где больше всего SSR-рендера. **S**

**RES-18 · Нет глобальной системы тостов; 13 `window.alert()` вместо неё** — ни `sonner`, ни `react-hot-toast`, ни `<Toaster>`, ни файла `*toast*` в `src/`. Единственный статус-провайдер — `save-status-provider.tsx`, привязанный к редактору расписания. В коде это уже признано:
```tsx
// src/features/master/components/notifications/mark-read-button.tsx:33-35
} catch {
  // Surface failures via the global toast in a follow-up; for now
  // the user can retry on the next render.
}
```
Пострадавшие поверхности (тихий отказ мутации): отметка уведомлений прочитанными (мастер и клиент), `notifications-center-page.tsx:357,385,437,484` — четыре пустых `catch`, `client-notifications-page.tsx:171-180` — `void fetch(...).then(...)` **без `.catch()`**, отмена брони в `booking-flow-stepper.tsx:464-472` (нет ни ветки `!res.ok`, ни сообщения). **M**

**RES-19 · SSE: `onerror` — пустая функция, деградация не показывается, polling-фоллбэка нет**
```ts
// src/features/notifications/hooks/use-notifications-bell.ts:101-103
source.onerror = () => {
  // Let EventSource retry automatically.
};
```
Нативный авто-ретрай покрывает транзиентный обрыв, но **не** покрывает permanent-close (не-2xx или неверный `Content-Type` → спека предписывает `readyState = CLOSED` без ретрая) — а именно это вернёт роут при RES-02 (503 `NOTIFIER_UNAVAILABLE`). `readyState` не проверяется, состояние не выставляется, хук отдаёт только `{ hasUnread, unreadCount, refresh }` — рендерить «связь потеряна» не из чего. Периодического refetch нет: счётчик замирает до полной навигации. Смягчает только параллельная подписка на внутреннюю шину (`:82-87`) — внутривкладочные действия счётчик обновляют. **S**

**RES-20 · Cron продления: `billingPayment.create` вне `try` — гонка двух прогонов роняет весь прогон** — `src/app/api/billing/renew/run/route.ts:286-289` делает `findUnique` по `idempotenceKey`, а `create` на строке 347 находится **вне** `try` (он открывается только на 369, вокруг `createRecurringPayment`). Два одновременных вызова cron'а (ретрай планировщика, дубль в crontab) оба не найдут строку, оба вызовут `create`, второй получит P2002 → необработанное исключение → 500 из POST → **остаток списка подписок в этом прогоне не обработан**. Восстановится на следующем прогоне (условие `nextBillingAt: { lte: now }` — догоняющее), но тихо. Фикс: обернуть `create` и трактовать P2002 как «уже создано» (проектный паттерн P2002-re-read, §10 контекста). **S**

**RES-21 · S3-клиент без request/connection-таймаута** — `src/lib/media/storage/s3.ts:59`: ни `requestHandler`, ни `NodeHttpHandler`, ни `requestTimeout`/`connectionTimeout` (`grep -rn "requestHandler|NodeHttpHandler|requestTimeout" src/` → 0). Только неявный `maxAttempts: 3`. Держит аплоад медиа и джобу `media.purge` (удаление ПДн). **S**

**RES-22 · web-push без таймаута** — `src/lib/notifications/push/send.ts:51`: `webpush.sendNotification(subscription, body)` **без третьего аргумента опций**. Фан-аут через `Promise.all` по всем подпискам пользователя: один зависший push-endpoint задерживает весь фан-аут. Промис не reject'ит (подтверждено), так что воркер не падает, но джоба висит и жжёт lease. **S**

**RES-23 · Telegram-алерты (ops) без таймаута** — `src/lib/monitoring/alert.ts:68`. Вызывается через `void` из `logError` (`logging/logger.ts:71`), запрос не блокируется, но под error-storm накапливаются висящие сокеты undici — в канале, который для того и существует, чтобы работать именно во время инцидента. 5-минутный cooldown (`alerts.ts`) снижает частоту, но не устраняет. **S**

**RES-24 · Prisma без `statement_timeout` и без параметров пула** — `src/lib/prisma.ts:9` передаёт только `log`; `.env.production.example:27` — `postgresql://…?schema=public`, без `connection_limit`/`pool_timeout`/`connect_timeout`. `statement_timeout` не задаётся ни в URL, ни (насколько видно из репозитория) на стороне Postgres. Один патологический запрос держит слот пула до победного; из-за RES-04 это напрямую превращается в самоусиливающееся зависание. **S**

**RES-25 · `pingHealthcheck` воркера без таймаута** — `src/worker.ts:274-279`: `await fetch(healthcheckUrl, { method: "POST", headers: {...} })`. Вызывается из главного цикла (`:690` `await maybePingHealthcheck()`) **до** `dequeue()`. Если `app` завис, воркер перестаёт разбирать очередь — при том что его собственные зависимости (Redis, Postgres) в порядке. Один зависший HTTP-хоп останавливает обработку задач. **S**

---

### P3 🔵

**RES-26 · MRR-снапшот за пропущенный день не бэкфиллится** — `createMrrSnapshotForToday()` (`src/lib/billing/mrr-snapshot.ts:93-105`) читает/пишет строго `utcDateOnly(now)`. Пропуск cron'а на сутки = навсегда дыра в ряду; догоняющей выборки «дни без снапшота» нет. Идемпотентность в пределах дня есть (`@unique snapshotDate`, race-safe через P2002). Аналитика, не core. **S**

**RES-27 · Redis без `maxmemory`/`maxmemory-policy`, очередь и кэш в одном инстансе** — `docker-compose.prod.yml:123-126`: `redis-server --appendonly yes --requirepass …`. Сегодня безопасно (дефолт `noeviction` — очередь не вытесняется), но лимита памяти нет вовсе, и любое будущее «поставим `allkeys-lru`, а то память течёт» **молча начнёт выбрасывать джобы**. Зафиксировать явно: `maxmemory-policy noeviction` + `maxmemory` с запасом, либо развести кэш и очередь по разным DB/инстансам. **S**

**RES-28 · Empty states без действия на 7 основных списках** — `docs/QUALITY-GATES.md:31` требует «1 фраза + 1 кнопка-действие». Общий `src/components/ui/empty-state.tsx` импортируют 10 файлов, и почти все — вторичные. Руками собраны, без CTA: `master/components/bookings/empty-column.tsx:3-11` (ещё и только `text-xs text-text-sec/60`), `master/components/clients/clients-list.tsx:28-40`, `master/components/reviews/reviews-feed.tsx:36-46`, `studio-cabinet/bookings/components/bookings-table.tsx:19-27`, `studio-cabinet/masters/components/masters-list.tsx:32-37`, `studio-cabinet/masters/components/master-detail-panel.tsx:10-15`, `studio-cabinet/clients/components/clients-table.tsx:24-32`. Отдельный запах: три файла `client-cabinet` объявляют локальную `function EmptyState()` с тем же именем, что общий экспорт. **M**

**RES-29 · `studio-masters-carousel.tsx:147` — сырой `next/image` для миниатюр портфолио** — `<Image src={thumb} alt="" fill sizes="80px" />` без `onError` и без гейта `isOptimizableImageSrc`, при том что аватар 17 строками выше (`:130`) использует `ResilientImage`. Битый ключ = сломанная картинка; хост вне `remotePatterns` = throw в рендере. Связанное: `remotePatterns` (`next.config.ts:99`) и `ALLOWED_REMOTE_IMAGE_HOSTS` (`src/components/ui/image-host.ts:23`) синхронизируются комментарием, без теста. **S**

**RES-30 · Битый (не-null) URL аватара падает на *портфолио*-плейсхолдер, а не на инициалы** — `master-user-chip.tsx:52-67`, `conversation-row.tsx:47-59`: ветка с инициалами срабатывает только при `avatarUrl === null`. `ResilientImage` уже принимает `fallbackSrc` (`resilient-image.tsx:42`), но ни один вызов его не передаёт. **S**

**RES-31 · Мёртвые артефакты роутинга** — `src/app/(public)/pricing/loading.tsx` без `page.tsx` (живой роут `/pricing` своего `loading.tsx` не имеет); `src/app/(provider)/` — route-группа с одним `layout.tsx` и нулём страниц. **S**

---

## Известные открытые — верифицированный статус

| Пункт | Статус по коду |
|---|---|
| **Регрессия «воркер падает на `server-only`»** (обязательная проверка) | **Регрессии нет.** `scripts/check-worker-boot.mjs` проверяет обе точки входа: npm-скрипт (`package.json` → `worker = npx --yes tsx --conditions=react-server src/worker.ts`) и `Dockerfile.worker` CMD (`node_modules/.bin/tsx --conditions=react-server src/worker.ts`) — обе флаг несут. Гейт входит в `npm run check`. Плюс probe спавнит Node и доказывает, что условие действительно нейтрализует `server-only`, и sentinel проверяет, что без него пакет всё ещё бросает — то есть гейт **не вакуумный** |
| **OTP в plaintext в логах** | Подтверждено намеренным: `otp/request/route.ts:62-67` → `...(isProduction ? {} : { code })`. Дополнительно закрыто env-рефайном `env.ts:320-338` (прод + phone-auth + не настроенный SMS = отказ на старте). Не находка |
| **Гэпы `minBookingHoursAhead` / `slotPrecision` / `lateCancelAction`** | Вне scope этого обхода; enforcement `minBookingHoursAhead` виден в `bookable-window.ts` через `listBookableSlots`. Статус не менялся |
| **VK Bot delivery не реализован** | Подтверждено: `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED` default OFF, канала доставки нет (`env.ts:496-513`). Не находка |
| **Версия pgvector на проде не подтверждена** | Не проверялось (нет доступа к прод-БД). Остаётся открытым |
| Cross-tenant writes, захват брони, анонимный доступ к медиа, open redirect, targeted OTP-lockout | Регрессий не встретил. `verifyScopeId` (`otp-rate-limit.ts:44-46`) на месте — lockout скоупится `(identity + IP)` |
| `prisma-direct` sync-throw | Throw на месте (`prisma-direct.ts:11-13`), но `DIRECT_URL` есть в прод-шаблоне, а потребителей всего два (`api/model-applications/[id]/confirm`, `lib/studio/transfer-master.ts`). Регрессией не считаю |

---

## Гипотезы — не доказано

1. **Веб-процесс не может упасть от «плавающего» промиса.** Next 16 ставит собственные обработчики: `node_modules/next/dist/server/next-server.js:149` `installProcessErrorHandlers(...)` (вызов на `:557`) — `process.on('unhandledRejection', …)` и `process.on('uncaughtException', …)`, оба только `console.error(reason)`, с явным комментарием «we definitely shouldn't crash the entire process»; плюс дубль в `lib/router-server.js:581`. По коду процесс переживёт. **Не проверено вживую** на собранном standalone-артефакте — и следствие всё равно неприятно: такие ошибки идут только в stdout, мимо GlitchTip (смежно с RES-17).
2. **Точный момент fail-fast валидации env в приложении.** `src/app/layout.tsx:1` импортирует `@/lib/startup`, `src/proxy.ts:4` тянет `@/lib/env` транзитивно — но при ленивой загрузке модулей Next «отказ на старте» может фактически стать «отказом на первом запросе». Для воркера всё однозначно (`worker.ts:2`). Проверяется только запуском прод-образа с намеренно битым env.
3. **Поведение `disableOfflineQueue: true` при текущем `reconnectStrategy`.** Логически это превратит зависание в мгновенный `ClientOfflineError`, но взаимодействие с memoized-клиентом в `connection.ts` надо проверять эмпирически, а не рассуждением.
4. **Зависание `client.ping()` в `/api/health`** (`health/route.ts:21`, тоже без `withRedisCommandTimeout`). Compose-healthcheck имеет `timeout: 10s` (`docker-compose.prod.yml:68`), так что проба честно провалится. Но какой таймаут стоит у внешнего ALB — из репозитория не выводится.
5. **Реальная частота окна RES-03** (Redis жив на rate-limit и мёртв на `enqueue`) — оценить можно только по метрикам живого прода.

---

## Предлагаемые записи в `BACKLOG.md` (готовые строки — владелец вмержит сам)

> Ничего в `BACKLOG.md` не записано. Deploy/ops-пункты (RES-16, RES-24 в части URL, RES-27) по правилу CLAUDE.md #15 идут в `DEPLOY-BACKLOG.md` и помечены соответственно.

```markdown
- 🟠 **RES-01 · CACHE-REDIS-TIMEOUT** — прогнать все команды `src/lib/cache/redisClient.ts` через `withRedisCommandTimeout`; таймаут = cache-miss. Сегодня слоты/каталог/план/идемпотентность зависают без границы при Redis brownout (node-redis offline queue + бесконечный reconnectStrategy). Тест: сломанный вход должен падать.
- 🟠 **RES-02 · NOTIFIER-LAZY-RETRY** — `notificationsNotifier` (`notifier.ts:127`) — одноразовый промис; отказ Redis на module-eval навсегда убивает in-app уведомления в процессе. Сделать ленивым с bounded-ретраем. Заодно привести `docs/runbooks/redis-down.md` в соответствие (сейчас runbook ждёт самовосстановления `notifier.mode = "redis"`, которого не будет).
- 🟠 **RES-03 · BOOKING-REMINDER-ENQUEUE-GUARD** — обернуть `await scheduleBookingReminders` в `createBooking.ts:285` и `createClientBooking.ts:263` тем же try/catch, что уже стоит в `confirmBooking.ts:219-226`. Сейчас post-commit enqueue-fail отдаёт 500 на уже созданную бронь.
- 🟠 **RES-04 · PROXY-REFRESH-TIMEOUT** — `AbortSignal.timeout` + try/catch на self-fetch `/api/auth/refresh` в `proxy.ts:198-208`. Без границы — самоусиливающееся зависание на каждом запросе с протухшим access-токеном.
- 🟠 **RES-05 · SMTP-TIMEOUTS** — `connectionTimeout`/`greetingTimeout`/`socketTimeout` для `email/sender.ts:19` и двух inline-транспортов в support-роутах; убрать `transporter.verify()` из горячего пути. Email-OTP — единственный включённый канал входа в проде.
- 🟠 **RES-06 · ROOT-ERROR-BOUNDARY** — добавить `src/app/error.tsx` (`ErrorState` + `UI_TEXT`), закрывающий `/`, `/catalog`, `/login`, `/book`, `/pricing`, `/notifications` и остальные ungrouped-роуты. Сейчас они падают сразу в `global-error.tsx` и теряют layout.
- 🟠 **RES-07 · AUTOSAVE-CATCH** — try/catch вокруг `fetch` в `editable-field-row.tsx:63-72` и в `performSave` (`use-autosave.ts:83-90`). Сейчас сетевой сбой оставляет чип «сохраняется» навсегда и молча теряет правку.
- 🟡 **RES-08 · SMS-TIMEOUT** — таймаут на оба `fetchImpl` в `smsc-provider.ts:164,187`. Поднять до 🟠 одновременно с включением `PHONE_AUTH_ENABLED`.
- 🟡 **RES-09 · OAUTH-TIMEOUTS** — таймауты на token/profile-обмены `vk/oauth.ts:144,184` и `yandex/oauth.ts:117,154`.
- 🟡 **RES-10 · GEO-TIMEOUTS** — таймауты на Геокодер (`api/address/geocode/route.ts:58`, `cities/yandex-locality.ts:98`) и дефолтный signal в `maps/address-suggest.ts:66`.
- 🟡 **RES-11 · OTP-RATELIMIT-REDIS-TIMEOUT** — обернуть команды `auth/otp-rate-limit.ts` в `withRedisCommandTimeout`, таймаут → существующая ветка 503 RATE_LIMIT_UNAVAILABLE.
- 🟡 **RES-12 · PORTFOLIO-UPLOAD-CATCH** — `catch` в `upload-modal.tsx:124-186` + отчёт о частичном успехе батча.
- 🟡 **RES-13 · PUBLIC-SLOTS-ERROR-ENVELOPE** — try/catch + `fail()` в `api/public/providers/[providerId]/{slots,booking-days}`; ревизия остальных 16 роутов без catch.
- 🟡 **RES-14 · REMINDER-RECONCILER** — периодический свип «CONFIRMED-брони в горизонте 24 ч без запланированного напоминания» → перепланировать. Сейчас очередь — единственная запись о напоминании.
- 🟡 **RES-15 · PACKAGE-BOOKING-REMINDERS** — `package-booking.ts` / `package-booking-studio.ts` не вызывают `scheduleBookingReminders` вообще; клиент пакета не получает напоминаний.
- 🟡 **RES-17 · BOUNDARY-REPORT-TO-GLITCHTIP** — `(public)`/`(cabinet)`/`(admin)` `error.tsx` шлют только `/api/log-error`; добавить `reportError`, как в `global-error.tsx`.
- 🟡 **RES-18 · GLOBAL-TOAST** — единый тост-примитив; заменить 13 `window.alert()` и закрыть тихие мутации (mark-read ×6 сайтов, отмена брони).
- 🟡 **RES-19 · SSE-DEGRADATION** — проверять `EventSource.readyState`, выставлять `isConnected` из `use-notifications-bell.ts`, добавить polling-фоллбэк на permanent-close.
- 🟡 **RES-20 · RENEW-CRON-P2002** — обернуть `billingPayment.create` (`billing/renew/run/route.ts:347`) и трактовать P2002 как «уже создано»; сейчас гонка прогонов обрывает весь прогон.
- 🟡 **RES-21 · S3-REQUEST-TIMEOUT** — `NodeHttpHandler` с `requestTimeout`/`connectionTimeout` в `media/storage/s3.ts:59`.
- 🟡 **RES-22 · WEBPUSH-TIMEOUT** — опции с `timeout` в `webpush.sendNotification` (`push/send.ts:51`).
- 🟡 **RES-23 · OPS-ALERT-TIMEOUT** — таймаут на Telegram-алерты (`monitoring/alert.ts:68`).
- 🔵 **RES-26 · MRR-SNAPSHOT-BACKFILL** — догонять пропущенные дни в `createMrrSnapshotForToday`.
- 🔵 **RES-28 · EMPTY-STATE-ADOPTION** — перевести 7 списков кабинетов на общий `EmptyState` с CTA (QUALITY-GATES §31); убрать локальные `function EmptyState()` в `client-cabinet`.
- 🔵 **RES-29 · RESILIENT-IMAGE-COVERAGE** — `studio-masters-carousel.tsx:147` на `ResilientImage`; тест синхронности `remotePatterns` ↔ `ALLOWED_REMOTE_IMAGE_HOSTS`.
- 🔵 **RES-30 · AVATAR-FALLBACK-SRC** — передавать `fallbackSrc`/инициалы в аватарных вызовах `ResilientImage`.
- 🔵 **RES-31 · ROUTING-DEAD-FILES** — удалить `src/app/(public)/pricing/loading.tsx` (сирота) и пустую группу `src/app/(provider)/`; при желании добавить `loading.tsx` живому `/pricing`.
```

Для `DEPLOY-BACKLOG.md`:

```markdown
- 🟡 **RES-16 · STOP-GRACE-PERIOD** — задать `stop_grace_period` (30-60 c) для `app` и `worker` в `docker-compose.prod.yml`. Сейчас docker-дефолт 10 c: длинная джоба получает SIGKILL, восстанавливается только через `recoverStuckJobs` (+5 мин и лишний attempt на каждый деплой).
- 🟡 **RES-24 · DB-TIMEOUTS** — добавить `connect_timeout`/`pool_timeout`/`connection_limit` в прод-`DATABASE_URL` и `statement_timeout` на стороне Postgres. Один патологический запрос сейчас держит слот пула бессрочно.
- 🟡 **RES-25 · WORKER-HEALTHCHECK-TIMEOUT** — таймаут на `pingHealthcheck` (`worker.ts:274`); зависший `app` останавливает разбор очереди.
- 🔵 **RES-27 · REDIS-MEMORY-POLICY** — явно задать `maxmemory` + `maxmemory-policy noeviction` (или развести кэш и очередь). Сегодня лимита нет вовсе; переключение на `allkeys-lru` в будущем начнёт молча вытеснять джобы.
- 🔵 **HEALTHCHECK-WORKER** — у сервиса `worker` в `docker-compose.prod.yml` нет `healthcheck` вообще (у `app`/`postgres`/`redis` есть). `/api/health/worker` для этого существует, но снаружи никто не смотрит.
```

---

## План фиксов (упорядоченный список будущих FIX-промптов, каждый = один коммит)

| # | Промпт | Содержание | Оценка |
|---|---|---|---|
| 1 | **FIX-RES-TIMEOUTS-A** | Таймауты на исходящий HTTP, «дешёвая половина»: SMTP (RES-05), SMSC (RES-08), OAuth ×4 (RES-09), Геокодер/Suggest ×3 (RES-10), ops-Telegram (RES-23), worker-healthcheck (RES-25). Однотипная правка, один тест «signal передан». Первым — потому что закрывает 12 из 12 незащищённых внешних вызовов и ничего не ломает | M |
| 2 | **FIX-RES-REDIS-TIMEOUT** | RES-01 + RES-11: `withRedisCommandTimeout` во всей кэш-прослойке и в `otp-rate-limit`; таймаут → cache-miss / существующая 503-ветка. Guard-тест, доказанный не-вакуумным (прогнать со сломанным входом) | M |
| 3 | **FIX-RES-BOOKING-SIDE-EFFECTS** | RES-03 (обернуть `scheduleBookingReminders` в двух create-путях) + RES-13 (конверт ошибки на `slots`/`booking-days`) + RES-15 (напоминания для пакетов). Одна тема: «post-commit эффект не должен отменять успешную бронь» | M |
| 4 | **FIX-RES-PROXY-REFRESH** | RES-04: таймаут + try/catch на self-fetch в middleware. Отдельным коммитом — трогает горячий путь всех запросов, нужен чистый rollback | S |
| 5 | **FIX-RES-NOTIFIER-LAZY** | RES-02: ленивый notifier с bounded-ретраем + правка `docs/runbooks/redis-down.md` в том же коммите | M |
| 6 | **FIX-RES-ERROR-BOUNDARY** | RES-06 (`src/app/error.tsx`) + RES-17 (`reportError` в трёх сегментных boundary). Скилл `ui-ux-pro-max` обязателен — это UI | M |
| 7 | **FIX-RES-CLIENT-FEEDBACK** | RES-07 (autosave) + RES-12 (upload) + RES-18 (тост-примитив, замена `window.alert`) + RES-19 (SSE-деградация). Скилл `ui-ux-pro-max` обязателен | L |
| 8 | **FIX-RES-JOB-DURABILITY** | RES-14 (реконсилятор напоминаний) + RES-20 (P2002 в renew-cron) + RES-26 (бэкфилл MRR) | M |
| 9 | **FIX-RES-SDK-TIMEOUTS** | RES-21 (S3 `NodeHttpHandler`) + RES-22 (web-push) — требуют проверки на живом стеке, поэтому позже | S |
| 10 | **FIX-RES-COSMETIC** | RES-28/29/30/31 — empty states, `ResilientImage`, мёртвые файлы роутинга. Скилл `ui-ux-pro-max` | M |

Deploy-часть (RES-16, RES-24, RES-25-инфра, RES-27, healthcheck воркера) идёт не коммитами, а через `DEPLOY-BACKLOG.md` — это конфигурация площадки.

---

## 🚨 Pre-launch риски, за которыми следить

1. **Двенадцать исходящих HTTP-вызовов без таймаута** — SMSC ×2, Геокодер ×2, Suggest, ops-Telegram, VK OAuth ×2, Yandex OAuth ×2, SMTP ×3 (+2 `verify()`), S3, web-push, worker→healthcheck, `proxy.ts`→refresh. Из них **на пути входа в прод**: SMTP (единственный включённый канал) и OAuth-callback'и. Один медленный внешний партнёр = исчерпание ёмкости event loop без единого сигнала «таймаут».
2. **Отказ Redis ломает бронирование двумя разными способами.** (а) RES-01 — слот-пикер и `booking-days` зависают без границы, потому что кэш-слой не использует уже существующую в проекте обёртку. (б) RES-03 — при **мигающем** Redis бронь коммитится, а ответ пользователю становится 500, что без idempotency-key порождает вторую бронь. Fail-closed rate-limit прикрывает только полный отказ, не дребезг.
3. **Отсутствующие error boundaries на core-роутах** — `/`, `/catalog`, `/login`, `/book`, `/pricing`, `/notifications` не имеют segment-level `error.tsx`. Любая SSR-ошибка там даёт полностью голый документ вместо страницы с навигацией. `/book` при этом — второй booking-вход, и он защищён иначе, чем первый.
4. **Потеря задач при рестарте Redis.** Прямой потери нет: AOF включён (`--appendonly yes`), очередь и dead-letter переживают рестарт, `recoverStuckJobs` подбирает зависшее по staleness. Остаточные риски: окно `appendfsync everysec` (≤1 c), отсутствие `maxmemory-policy` (будущее переключение на `allkeys-lru` начнёт молча выбрасывать джобы), отсутствие `stop_grace_period` (SIGKILL длинной джобы на каждом деплое, +5 мин задержки), и главное — **у напоминаний о брони нет DB-backed восстановления**: строка `Booking` есть, но никто из неё напоминание не переroдит. Пакетные брони напоминания не получают вообще.
5. **Векторы краша процесса.** Воркер: `unhandledRejection` → `process.exit(1)` (`worker.ts:131-142`) — я проверил все `void`-вызовы на его путях (`sendPushToUser`, `sendAlert`, `sendTelegramAlert`, `recordSurfaceEvent`, `alertDeadJobs`): все структурно не reject'ят, крашевого пути не нашёл. Веб-процесс: Next ставит собственные не-фатальные обработчики (`next-server.js:194,215`), так что «плавающий» промис его не убьёт — но и в GlitchTip не попадёт, только в stdout. **Оставшийся риск — не краш, а зависание** (пп. 1-2): процесс жив, healthcheck зелёный, страницы не отвечают.
6. **Самоусиливающийся каскад через middleware** — `proxy.ts` на каждом запросе с протухшим access-токеном делает синхронный HTTP-хоп в собственный `/api/auth/refresh` без таймаута, а у Postgres нет `statement_timeout`. Замедление БД → замедление refresh → удвоение занятых слотов → дальнейшее замедление. Петлю нечем разорвать, пока идёт трафик.
7. **Расхождение runbook ↔ код (RES-02)** — `docs/runbooks/redis-down.md` предписывает дожидаться `notifier.ready = true` после восстановления Redis; по коду этот сигнал без рестарта `app` не появится. Дежурный будет думать, что инцидент не закрыт, при полностью здоровом Redis.
8. **Наблюдаемость отказов дырявая ровно там, где больше всего рендера** — три сегментных `error.tsx` не репортят в GlitchTip. Всё, что падает в кабинетах и на публичных профилях и ловится boundary, видно только в `/api/log-error` (структурный лог), но не в трекере.

---

### Context updates

**Не затронуто.** Аудит read-only: схема, роуты, env и core-flows не менялись — структурных триггеров (`docs/QUALITY-GATES.md` § «Обновление контекста») нет, поэтому `MASTERRYADOM_AI_CONTEXT.md` не правится.

Две фактические неточности в текущем снапшоте, которые стоит поправить **вместе с соответствующими фиксами**, а не сейчас:
- §5 «Уведомления»: `sendPushToUser` действительно структурно не reject'ит — **подтверждено**, правка не нужна.
- §11 / runbook `redis-down.md`: утверждение о самовосстановлении notifier'а после возврата Redis неверно (RES-02) — исправить в коммите **FIX-RES-NOTIFIER-LAZY**, в том же изменении.
