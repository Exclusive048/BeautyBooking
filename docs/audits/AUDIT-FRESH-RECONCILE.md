# AUDIT-FRESH-RECONCILE — статус 157 находок

| | |
|---|---|
| **Ветка** | `audit-fixes` |
| **HEAD** | `74173f9e2d490fc19f416cad3abc40ed66deeae3` (`74173f9e`) |
| **Дата** | 2026-08-12 |
| **Рабочее дерево** | **чистое** (`git status --porcelain` пуст). ⚠️ Промпт свипа предполагал незакоммиченную работу прошлых ходов — на момент прогона она уже в HEAD (`74173f9e`: UI-примитивы, инвариант email, скоуп конфликта) |
| **Аудиты снимались против** | `5a37b0a` |

> **Это свип статусов, а не повторный аудит.** Ни одна находка здесь не переоткрывается по существу: задача — сказать, что из 157 живо на `74173f9e`, чтобы следующие фикс-промпты не выясняли это каждый заново. Два P0-промпта подряд (`FIX-A1`, `FIX-A2`) оказались уже реализованными — этот файл существует, чтобы третьего такого не было.

## Как читать колонку «грейд»

Правило свипа: **коммит-сообщение, зелёный тест и наличие сторожа доказательством не считаются.** Поэтому у каждой строки указан грейд доказательства:

| Грейд | Что это значит |
|---|---|
| `read` | Механизм прочитан в этом свипе (или в двух предыдущих, `FIX-A1`/`FIX-A2`) — утверждение о закрытости моё |
| `anchor` | В реализации (не в тесте) есть код, помеченный ID находки, по указанному `file:line`. Механизм построчно **не** перечитывался |
| `absence` | Фикс — удаление; проверено грепом/сторожем отсутствия |
| `none` | Кода нет, статус выведен из ратифицированного решения (BLOCKED / DEFERRED / продуктовое) |

`anchor` честнее строки в `BACKLOG-DONE.md`, но слабее `read`. Строки с `anchor` — кандидаты на выборочную перепроверку, если цена ошибки высока.

---

## 1. Сводка

| Отчёт | Всего | CLOSED | PARTIAL | OPEN | SUPERSEDED | DISPUTED |
|---|---:|---:|---:|---:|---:|---:|
| 01 — безопасность | 30 | 30 | 0 | 0 | 0 | 0 |
| 02 — логика | 30 | 29 | 0 | 1 | 0 | 0 |
| 03 — устойчивость | 31 | 29 | 0 | 1 | 1 | 0 |
| 04 — производительность | 30 | 18 | 5 | 4 | 0 | 3 |
| 05 — UI/UX | 36 | 29 | 3 | 3 | 1 | 0 |
| **Итого** | **157** | **135** | **8** | **9** | **2** | **3** |

По серьёзности (незакрытое):

| | OPEN | PARTIAL | DISPUTED |
|---|---:|---:|---:|
| P0 | 0 | 0 | 0 |
| P1 | 2 | 3 | 0 |
| P2 | 5 | 3 | 2 |
| P3 | 2 | 2 | 1 |

**`NEEDS-DEEP-CHECK` — 0 строк.** Не потому что всё прочитано, а потому что грейд `anchor` несёт ту же информацию честнее: он говорит «код есть по этому адресу, механизм не перечитан», вместо того чтобы прятать это за отдельным статусом.

---

## 2. Ледж

### AUDIT-FRESH-01 — безопасность (30)

| ID | Sev | Статус | Грейд | Evidence | Заметка |
|---|---|---|---|---|---|
| SEC-01 | P0 | CLOSED | read | `lib/auth/email-login-profile.ts:84-90` | Вход резолвит только `emailVerifiedAt != null`; P2002-ветка (`:63`) применяет тот же фильтр |
| SEC-02 | P1 | CLOSED | read | `lib/env.ts:603`, `api/auth/otp/email/request/route.ts:22`, `.../verify/route.ts:34` | Килсвитч в **обоих** роутах; ID в коде не помечен — отсюда пустой греп |
| SEC-03 | P1 | CLOSED | anchor | `lib/pagination/cursor.ts:14` | Ключ лимита по шаблону роута |
| SEC-04 | P1 | CLOSED | anchor | `api/address/geocode/route.ts:60` | Части (б)/(в) **ратифицированы как «не делать»**; by-photo закрыт кампанией-02 (`192962b7`) |
| SEC-05 | P1 | CLOSED | anchor | `api/masters/[id]/availability/route.ts:17` | `requirePublished` для чужих, своя сторона через `requireProviderOwner` |
| SEC-06 | P1 | CLOSED | anchor | `api/master/clients/[clientKey]/card/photos/route.ts:47` | Общий `readValidatedImageUpload` |
| SEC-07 | P1 | CLOSED | anchor | `app/sw.ts:1` | Остаток (`next-pwa`→workbox) закрыт кампанией-02 (`dce6f603`); `npm audit` high = 0 |
| SEC-08 | P2 | CLOSED | anchor | `api/auth/refresh/route.ts:18` | Слой `Content-Type` — в BACKLOG, осознанно |
| SEC-09 | P2 | CLOSED | absence | `api/auth/profile-ensure-removed.test.ts:6` | Роут удалён; сторож против возврата |
| SEC-10 | P2 | CLOSED | anchor | `api/media/file/[id]/route.ts:143` | Токен = «какой актив», сессия+ACL = «кому можно» |
| SEC-11 | P2 | CLOSED | anchor | `lib/pagination/cursor.ts:14` | Остаток (id вопросов booking-флоу) — дословное исключение rule 12 |
| SEC-12 | P2 | CLOSED | anchor | `api/catalog/autocomplete/route.ts:68` | То же исключение rule 12 для booking-флоу |
| SEC-13 | P2 | CLOSED | anchor | `lib/auth/jwt.ts:26` | `fid` (семья сессий) в access-токене |
| SEC-14 | P2 | CLOSED | anchor | `lib/env.ts:109` | + гейт `check:env-discipline` (инв. #39) |
| SEC-15 | P2 | CLOSED | anchor | `api/hot-slots/route.ts:67` | Кэш 120 с + свой тир; ключ только из влияющих параметров |
| SEC-16 | P2 | CLOSED | anchor | `api/log-error/route.ts:33` | Планка 1 МБ, два слоя |
| SEC-17 | P2 | CLOSED | anchor | `lib/api/errors.ts:79` | Квота 10 ГБ; тарифная — в BACKLOG (продуктовое) |
| SEC-18 | P2 | CLOSED | anchor | `lib/ai/prompts.ts:2` | `wrapUntrusted` + правило в системном промпте |
| SEC-19 | P3 | CLOSED | anchor | `lib/api/cache-headers.ts:15` | CORS-аллоулист действует и в dev |
| SEC-20 | P3 | CLOSED | anchor | `api/health/status/route.ts:40` | constant-time сравнение |
| SEC-21 | P3 | CLOSED | anchor | `api/billing/mrr/snapshot/run/route.ts:17` | Cron-секрет только заголовком |
| SEC-22 | P3 | CLOSED | anchor | `app/sw.ts:7` | Мёртвое правило Supabase удалено |
| SEC-23 | P3 | CLOSED | anchor | `lib/env.ts:358` | `STORAGE_PROVIDER=local` в проде — отказ на старте |
| SEC-24 | P3 | CLOSED | absence | `api/auth/refresh/route.ts:11` | GET-обработчик удалён |
| SEC-25 | P3 | CLOSED | anchor | `api/health/status/route.ts:36` | constant-time |
| SEC-26 | P3 | CLOSED | anchor | `lib/auth/otp-rate-limit.ts:11` | Два бюджета: `(идентичность,IP)` + потолок на идентичность |
| SEC-27 | P2 | CLOSED | anchor | `api/studios/[id]/masters/route.ts:19` | Правило в `where` чтения И записи; контракт согласия — в BACKLOG |
| SEC-28 | P3 | CLOSED | anchor | `api/studios/[id]/leave/route.ts:33` | Выровнен на `Provider.id` |
| SEC-29 | P3 | CLOSED | anchor | `lib/bookings/client-privacy.test.ts:84` | Обратный guard `MASTER_CRM_READERS` (см. §4) |
| SEC-30 | P3 | CLOSED | absence | `scripts/check-encoding.test.ts:6` | Сирота удалена; живой `check:encoding` покрывает шире |

### AUDIT-FRESH-02 — логика (30)

| ID | Sev | Статус | Грейд | Evidence | Заметка |
|---|---|---|---|---|---|
| LOGIC-01 | P0 | CLOSED | read | `lib/bookings/booking-core.ts:122` | 🔴 Была **пятая** копия (`usecases.ts:43`, путь предложения переноса) — найдена и закрыта в `74173f9e`. Двойной брони не давала (применение переноса шло общим скоупом). Пп. 4 (DB-констрейнт) и 5 (личный профиль) — см. §5/§7 |
| LOGIC-02 | P1 | CLOSED | anchor | `lib/api/errors.ts:17` | `applyBookingTransition` с ожидаемым статусом в `where` |
| LOGIC-03 | P1 | CLOSED | anchor | `lib/bookings/usecases.ts:148` | Длительность выводит сервер из снапшотов |
| LOGIC-04 | P1 | CLOSED | anchor | `lib/studio/bookings.service.ts:582` | `PACKAGE_CANCEL_WHOLE` на обеих сторонах |
| LOGIC-05 | P1 | CLOSED | anchor | `lib/studio/bookings.service.ts:614` | ⚠️ Аудит ошибся про кнопку в UI → `NO-SHOW-UI` в BACKLOG |
| LOGIC-06 | P1 | CLOSED | read | `api/model-applications/[applicationId]/confirm/route.ts:284` | `assertNoTimeBlockConflict` на пятом пути создания |
| LOGIC-07 | P1 | CLOSED | anchor | `api/billing/renew/run/route.ts:31` | Граница ошибки на элемент + лок (fail-open осознанно) |
| LOGIC-08 | P2 | CLOSED | anchor | `api/billing/checkout/route.ts:19` | P2002 re-read → та же платёжная ссылка |
| LOGIC-09 | P2 | CLOSED | anchor | `api/public/packages/[id]/book/route.ts:116` | Идемпотентность пакетов (инв. #28) |
| LOGIC-10 | P2 | CLOSED | anchor | `features/booking/.../booking-flow-stepper.tsx:365` | `DUPLICATE_REQUEST` vs `SLOT_CONFLICT` |
| LOGIC-11 | P2 | CLOSED | anchor | `lib/schedule/bookable-window.ts:146` | Канон `override-order.ts`; констрейнт+дедуп — в BLOCKED |
| LOGIC-12 | P2 | CLOSED | anchor | `lib/schedule/editor.ts:453` | Снапшот одной транзакцией |
| LOGIC-13 | P2 | CLOSED | anchor | `api/cabinet/master/schedule/route.ts:179` | Выходной + отмены атомарно |
| LOGIC-14 | P2 | CLOSED | anchor | `lib/rate-limit/index.ts:38` | `/api/billing` fail-closed + явные изъятия |
| LOGIC-15 | P2 | CLOSED | anchor | `lib/queue/queue.ts:422` | Право на восстановление даёт `lRem` |
| LOGIC-16 | P2 | CLOSED | anchor | `lib/reviews/recalculate-ratings.ts:7` | `FOR UPDATE` до агрегата, единственный writer |
| LOGIC-17 | P3 | CLOSED | read | `lib/bookings/booking-core.ts:154` | `buildConflictWindowWhere`; ⚠️ `confirmBooking` и модель-оффер держат эквивалентное окно **инлайном** — дубль арифметики, в BACKLOG |
| LOGIC-18 | P3 | **OPEN** | none | — | Продуктовое решение владельца (оба пути меняют видимое). Разбор — `AUDIT-CAMPAIGN-BLOCKED.md` |
| LOGIC-19 | P3 | CLOSED | anchor | `lib/deletion/delete-master.ts:69` | FK `TimeBlock.masterId` + явная чистка |
| LOGIC-20 | P3 | CLOSED | anchor | `prisma/schema/migrations/20260805183412_.../migration.sql:1` | 4 CHECK'а + реестр raw-sql |
| LOGIC-21 | P1 | CLOSED | anchor | `features/master/.../manual-booking-modal.tsx:23` | Клик по сетке конвертирует в salon-tz |
| LOGIC-22 | P1 | CLOSED | anchor | `lib/auth/session-refresh.ts:11` | Свежая кука сливается во входящий заголовок; 6 форм мимо `fetchWithAuth` — в BLOCKED |
| LOGIC-23 | P2 | CLOSED | anchor | `features/client-cabinet/.../use-profile-autosave.ts:35` | `useSerialTask` под всеми автосейвами |
| LOGIC-24 | P2 | CLOSED | anchor | `api/me/route.ts:47` | Поля убраны из схемы и зачисток |
| LOGIC-25 | P2 | CLOSED | anchor | `api/billing/renew/run/route.ts:374` | tz из кабинета получателя + метка зоны |
| LOGIC-26 | P2 | CLOSED | anchor | `features/booking/lib/studio-booking.ts:80` | Дата по умолчанию — salon-tz |
| LOGIC-27 | P3 | CLOSED | absence | `lib/notifications/format-booking-when.test.ts:51` | Мёртвый блок удалён; guard сторожит класс |
| LOGIC-28 | P3 | CLOSED | anchor | `features/admin-cabinet/.../charts.service.ts:24` | `timeZone: "UTC"` + пометка `tz-ok` |
| LOGIC-29 | P3 | CLOSED | anchor | `scripts/check-tz.mjs:34` | Регулярка `check:tz` починена |
| LOGIC-30 | P3 | CLOSED | anchor | `api/public/bookings/route.ts:53` | Единый `normalizeRussianPhone` |

### AUDIT-FRESH-03 — устойчивость (31)

| ID | Sev | Статус | Грейд | Evidence | Заметка |
|---|---|---|---|---|---|
| RES-01 | P1 | CLOSED | anchor | `lib/auth/otp-rate-limit.ts:88` | `withRedisCommandTimeout` на кэш-слой |
| RES-02 | P1 | CLOSED | anchor | `lib/notifications/notifier.ts:128` | Ленивый нотифаер + bounded-ретрай |
| RES-03 | P1 | CLOSED | anchor | `lib/bookings/reminders.ts:102` | `scheduleBookingRemindersSafe` |
| RES-04 | P1 | CLOSED | anchor | `lib/prisma-datasource.ts:9` | ≡ PERF-14 (см. §6); хопа больше нет вовсе |
| RES-05 | P1 | CLOSED | anchor | `api/support/partnership/route.ts:212` | `SMTP_TIMEOUTS` на все три транспорта |
| RES-06 | P1 | CLOSED | anchor | `app/error.tsx:10` | Корневой error boundary |
| RES-07 | P1 | CLOSED | anchor | `features/master/.../use-autosave.ts:11` | `safeSave` нормализует бросок |
| RES-08 | P2 | CLOSED | anchor | `lib/sms/smsc-provider.ts:156` | ⚠️ поднимается до 🟠 одновременно с `PHONE_AUTH_ENABLED=ON` |
| RES-09 | P2 | CLOSED | anchor | `lib/vk/oauth.ts:7` | 10 с на обмены VK/Яндекс |
| RES-10 | P2 | CLOSED | anchor | `api/address/geocode/route.ts:35` | 5 с + `AbortSignal.any` |
| RES-11 | P2 | CLOSED | anchor | `lib/auth/otp-rate-limit.ts:80` | Таймаут команд лимитера |
| RES-12 | P2 | CLOSED | anchor | `features/master/.../upload-modal.tsx:187` | `catch` со штатным текстом |
| RES-13 | P2 | CLOSED | anchor | `api/public/providers/[providerId]/booking-days/route.ts:25` | Остальные 16 роутов — в BACKLOG |
| RES-14 | P2 | CLOSED | anchor | `lib/bookings/reminders.ts:129` | Реконсилятор напоминаний |
| RES-15 | P2 | CLOSED | anchor | `lib/bookings/package-booking-studio.ts:392` | Напоминание на каждый компонент |
| RES-16 | P2 | CLOSED | anchor | `lib/queue/stop-grace-period.test.ts:6` | `stop_grace_period` в compose |
| RES-17 | P2 | CLOSED | anchor | `app/global-error.tsx:18` | `useErrorBoundaryReport` во всех пяти boundary |
| RES-18 | P2 | **OPEN** | none | — | DEFERRED-BIG: 13 `window.alert` + ~6 тихих `catch`. План — в BLOCKED (три коммита) |
| RES-19 | P2 | CLOSED | anchor | `features/notifications/hooks/use-notifications-bell.ts:23` | Опрос только при `CLOSED` |
| RES-20 | P2 | **SUPERSEDED** | read | `api/billing/renew/run/route.ts:458-488` | Закрыт LOGIC-07 (`c26a0059`); аудит снимался раньше |
| RES-21 | P2 | CLOSED | anchor | `lib/media/storage/s3.ts:7` | Таймауты S3 |
| RES-22 | P2 | CLOSED | anchor | `lib/notifications/push/send.ts:12` | `{ timeout: 10s }` у web-push |
| RES-23 | P2 | CLOSED | anchor | `lib/monitoring/alert.ts:8` | ⚠️ Аудит неверно числил cooldown смягчающим → `OPS-ALERT-COOLDOWN-ON-LOGERROR` в BACKLOG |
| RES-24 | P2 | CLOSED | anchor | `lib/prisma-datasource.ts:4` | `statement_timeout=30000` на оба клиента |
| RES-25 | P2 | CLOSED | anchor | `lib/queue/worker-healthcheck-timeout.test.ts:7` | 5 с на healthcheck |
| RES-26 | P3 | CLOSED | anchor | `lib/billing/mrr-snapshot.ts:154` | Подбор снапшота в воркере |
| RES-27 | P3 | CLOSED | anchor | `lib/queue/redis-eviction-policy.test.ts:7` | `noeviction` явно + guard |
| RES-28 | P3 | CLOSED | anchor | `features/client-cabinet/.../client-bookings-page.tsx:676` | Общий примитив empty-state |
| RES-29 | P3 | CLOSED | anchor | `features/public-studio/studio-masters-carousel.tsx:146` | `ResilientImage` + сверка списков хостов |
| RES-30 | P3 | CLOSED | anchor | `components/ui/resilient-image.tsx:44` | Слот `fallback?: ReactNode` |
| RES-31 | P3 | CLOSED | absence | `app/routing-artifacts.test.ts:7` | Осиротевшие артефакты удалены |

### AUDIT-FRESH-04 — производительность (30)

| ID | Sev | Статус | Грейд | Evidence | Заметка |
|---|---|---|---|---|---|
| PERF-01 | P1 | **OPEN** + DISPUTED | none | — | Все три пути упираются в ратифицированное (cookie-уведомление, CSP-nonce). ⚠️ «Минимальный шаг» аудита не работает: вложенный layout не отменяет корневой — находка противоречит себе |
| PERF-02 | P1 | **OPEN** | none | — | DEFERRED-BIG: 638 импортов `UI_TEXT`, 414 КБ. Кампания-02 п.10 — PENDING |
| PERF-03 | P1 | **PARTIAL** | anchor | `lib/legal/consent-flags-schema.ts:6` | `consent-flags` закрыт; `lib/env.ts` (16 компонентов) — открыт. 🔴 **Выигрыш пока ноль** — одной живой цепочки достаточно. Кампания-02 п.10 |
| PERF-04 | P1 | CLOSED | anchor | `lib/schedule/engine-context.ts:165` | Попадание в кэш — 1 запрос вместо 13 |
| PERF-05 | P1 | **PARTIAL** | anchor | `lib/catalog/catalog.service.ts:355` | Ценовой ранкер закрыт; денормализация `rankScore` — DEFERRED-BIG. ⚠️ «Дешёвый шаг» аудита (`take: 8`) неверен |
| PERF-06 | P1 | CLOSED | anchor | `features/studio-cabinet/clients/components/clients-header.tsx:8` | Окно 24 мес, кампания-02 п.3 (`73112713`). ⚠️ Вопрос из `AUDIT-OWNER-DECISIONS` §4 дефект не закрывал |
| PERF-07 | P1 | CLOSED | anchor | `api/bookings/upload-reference/route.ts:78` | `capLongestSide` на пяти путях; ≡ SEC-06 (§6) |
| PERF-08 | P1 | **PARTIAL** | anchor | `lib/bookings/recent-masters.ts:103` | Длительности закрыты; мультипровайдерный `ScheduleContext` — DEFERRED-BIG. ⚠️ Арифметика находки устарела после PERF-04 |
| PERF-09 | P1 | CLOSED | anchor | `prisma/schema/booking.prisma:134` | 5 индексов. ⚠️ Форма I-7 из аудита не работает → частичный индекс сырым SQL |
| PERF-10 | P2 | CLOSED | anchor | `api/public/providers/[providerId]/booking-days/route.ts:63` | `single-flight` |
| PERF-11 | P2 | CLOSED | anchor | `lib/client-cabinet/notification-groups.ts:1` | Рантайм Prisma ушёл из бандла; ⚠️ 26 модулей, а не 14 |
| PERF-12 | P2 | **OPEN** + DISPUTED | none | — | DEFERRED-BIG (57 файлов). ⚠️ Рецепт аудита (`domAnimation`) неверен: нет layout-анимаций и drag, отказ — **тихий no-op**. Кампания-02 п.9 |
| PERF-13 | P2 | CLOSED | anchor | `api/billing/plans/route.ts:63` | 4 справочника + `PUBLIC_REFERENCE_API_PATHS` |
| PERF-14 | P2 | CLOSED | anchor | `api/auth/refresh/route.ts:42` | ≡ RES-04 (§6). Хоп убран целиком |
| PERF-15 | P2 | **DISPUTED** | read | `components/ui/resilient-image.tsx` | Премиса неверна: 38 вызовов идут веткой `width`+`height` (дефолт `${width}px`), 25 `fill`-вызовов **все** передают `sizes`; на `100vw` не попадает ни один. Профилактика — `RESILIENT-IMAGE-FILL-SIZES` в BACKLOG |
| PERF-16 | P2 | CLOSED | anchor | `features/catalog/components/date-preset-calendar.tsx:15` | Календарь под `next/dynamic` |
| PERF-17 | P2 | CLOSED | anchor | `components/ui/qr-code-canvas.tsx:10` | Пять виджетов под `next/dynamic` |
| PERF-18 | P2 | CLOSED | anchor | `lib/schedule/engine-context.ts:131` | `scheduleVersion` без строки провайдера |
| PERF-19 | P3 | CLOSED | anchor | `lib/schedule/engine-context.ts:156` | `TimeBlock` в версии (+`_count` под удаления) |
| PERF-20 | P2 | **OPEN** | none | — | Продуктовое: стриминг меняет видимое и семантику отказа. ⚠️ Рецепт неприменим к 2 из 4 названных поверхностей. Устойчивостной дыры нет |
| PERF-21 | P2 | CLOSED | anchor | `lib/cache/types.ts:13` | Учёт слот-ключей вместо `SCAN` |
| PERF-22 | P2 | **PARTIAL** | anchor | `lib/client-cabinet/favorites.service.ts:58` | Два невидимых предела закрыты; списки с `take` — нужна пагинация ⇒ продуктовое. Кампания-02 п.11 — PENDING. ⚠️ Одна ссылка находки неверна (`notifications/service.ts:645` при 629 строках) |
| PERF-23 | P2 | CLOSED | anchor | `lib/auth/guards.ts:7` | `SESSION_USER_SELECT` + тип `SessionUser`; 8 входных путей — в BACKLOG |
| PERF-24 | P3 | CLOSED | anchor | `app/(cabinet)/cabinet/billing/page.tsx:61` | `Promise.all` ×5. ⚠️ Точка `studio/analytics/page.tsx:39-40` из находки ложная |
| PERF-25 | P3 | CLOSED | anchor | `features/admin-cabinet/.../bookings-chart.tsx:16` | Снято с 5 из 24 — остальные дают ноль: премиса находки о `"use client"` неверна (директива объявляет **границу**, не принадлежность) |
| PERF-26 | P3 | CLOSED | anchor | `lib/bookings/review-prompts.ts:31` | Пакетный загрузчик |
| PERF-27 | P3 | CLOSED | anchor | `features/admin-cabinet/.../events-feed.tsx:12` | Остаток (5→30 с) закрыт кампанией-02 (`8685617a`) |
| PERF-28 | P3 | **PARTIAL** | anchor | `app/globals.css:695` | 2 из 3; третья (`login-text-shimmer`) невозможна без переписывания эффекта: при `background-clip: text` отдельного слоя нет |
| PERF-29 | P3 | **DISPUTED** | read | — | Проверка выполнена, опровергает все три части: риска для CI нет (0 соединений без `REDIS_URL`), соединение одно а не ~30, причина названа неверно. Вывод чисто операционный |
| PERF-30 | P3 | CLOSED | anchor | `app/sw.ts:8` | Отдельное ведро `next-image-cache` |

### AUDIT-FRESH-05 — UI/UX (36)

| ID | Sev | Статус | Грейд | Evidence | Заметка |
|---|---|---|---|---|---|
| UI-01 | P1 | CLOSED | anchor | `api/admin/billing/plans/[id]/route.ts:66` | `.lux-*` возвращены в `@layer components` |
| UI-02 | P1 | CLOSED | absence | греп по `src/` — 0 совпадений | Непятикратные опасити (`/12`, `/8` …) отсутствуют; проверено этим свипом |
| UI-03 | P1 | CLOSED | absence | греп `bg-bg-muted` — 0 | Проверено этим свипом |
| UI-04 | P1 | CLOSED | anchor | `api/og/profile/route.tsx:14` | `brand-colors.ts` + сторож (инв. #40) |
| UI-05 | P1 | CLOSED | anchor | `app/globals.css:20` | Контраст placeholder; сторож `globals-contrast.test.ts` |
| UI-06 | P2 | CLOSED | anchor | `app/globals.css:73` | Мост токенов |
| UI-07 | P2 | CLOSED | anchor | `app/globals.css:398` | `glass-panel` |
| UI-08 | P2 | CLOSED | anchor | `components/ui/checkbox.tsx:22` | — |
| UI-09 | P2 | CLOSED | anchor | `app/globals.css:34` | `border-control` без альфы |
| UI-10 | P2 | CLOSED | anchor | `app/globals.css:61` | `accent-text-hover` |
| UI-11 | P2 | CLOSED | anchor | `app/globals.css:319` | — |
| UI-12 | P2 | **OPEN** | none | — | DEFERRED-BIG: 56 файлов / 99 строк. Сама находка называет это поэтапной миграцией |
| UI-13 | P2 | CLOSED | anchor | `components/layout/bottom-nav.tsx:152` | Оверлеи через общий a11y-контракт |
| UI-14 | P2 | **OPEN** | none | — | DEFERRED-BIG: 57 файлов; вторая половина меняет поведение шапки на каждой странице |
| UI-15 | P2 | CLOSED | anchor | `components/ui/checkbox.tsx:5` | `appearance` у нативных контролов |
| UI-16 | P2 | CLOSED | anchor | `scripts/check-dead-classes.mjs:3` | Гейт мёртвых классов (см. §4) |
| UI-17 | P2 | CLOSED | anchor | `features/cabinet/roles/roles-cards.tsx:85` | Канон текстов ошибок |
| UI-18 | P2 | CLOSED | anchor | `features/master/.../add-bundle-button.tsx:25` | CTA-инфинитив; 46 из 57 «нарушений» — не CTA |
| UI-19 | P2 | CLOSED | anchor | `scripts/check-ui-text.mjs:183` | Расширение гейта UI-текстов |
| UI-20 | P2 | **OPEN** | none | — | DEFERRED-BIG: 71 файл / ~100 сайтов |
| UI-21 | P2 | CLOSED | anchor | `lib/ui/text.ts:30` | — |
| UI-22 | P2 | **PARTIAL** | anchor | `09d03e0c` (кампания-02 п.6) | Ч.1 (9px→10px, 25 сайтов) закрыта. Ч.2 — шкала/радиусы, 490 сайтов в 261 файле — открыта |
| UI-23 | P3 | **SUPERSEDED** | none | — | Закрыто побочно UI-06/07 и заменой `pt-safe`/`pb-safe` |
| UI-24 | P3 | CLOSED | read | `.claude/skills/ui-ux-pro-max/SKILL.md` §6 | ⚠️ **Вне VCS** (`.claude/` в `.gitignore`) — на другой машине изменения нет |
| UI-25 | P3 | CLOSED | anchor | `components/ui/button.tsx:43` | `danger` на токене `destructive` |
| UI-26 | P3 | **PARTIAL** | read | `app/globals.css:140`, `components/ui/button.tsx` | Шаг 1 (токены+Badge, `90c543d4`) и область `components` (`74173f9e`) закрыты. Открыты области: client-cabinet(15) → admin(12) → catalog(11) → public(8) → studio(39) → master(58) |
| UI-27 | P3 | **PARTIAL** | read | `components/auth/telegram-login-button.tsx:170` | Те же области; в `src/components` `dark:`-сайтов больше нет |
| UI-28 | P3 | CLOSED | read | `features/master/.../booking-card-week.tsx:67` | `shadow-brand` вместо литерала — проверено этим свипом |
| UI-29 | P3 | CLOSED | anchor | `components/layout/bottom-nav.tsx:203` | Hit-area ≥44px (кампания-02 п.5) |
| UI-30 | P1 | CLOSED | anchor | `components/layout/app-shell-content.tsx:23` | Один `<main>` на документ (инв. #14) |
| UI-31 | P2 | CLOSED | anchor | `components/ui/form-control-label.test.ts:2` | Guard ужесточён после пробы |
| UI-32 | P2 | CLOSED | anchor | `features/master/.../address-editor.tsx:182` | `focus:ring-0` убран |
| UI-33 | P2 | CLOSED | anchor | `features/chat/chat-window/message-bubble.tsx:24` | ⚠️ Гейт `A11Y-EMPTY-NAME-GATE` осознанно **не** заведён — не удалось сделать невакуумным |
| UI-34 | P2 | CLOSED | anchor | `components/ui/otp-input.tsx:113` | Фокус OTP |
| UI-35 | P3 | CLOSED | anchor | `features/master/.../section-nav.tsx:75` | — |
| UI-36 | P3 | CLOSED | anchor | `lib/ui/text.ts:52` | — |

---

## 3. Открытое на P0/P1 — короткий список

**P0 — пусто.** Оба P0 (SEC-01, LOGIC-01) закрыты и прочитаны.

| # | ID | Sev | Что осталось | Блокирует |
|---|---|---|---|---|
| 1 | **PERF-03** | P1 | `lib/env.ts` тянет `zod` в 16 клиентских компонентов. **Выигрыша от сделанной половины ноль** — одной живой цепочки достаточно | Кампания-02 п.10 (PENDING) |
| 2 | **PERF-02** | P1 | Сплит `UI_TEXT` (414 КБ, 638 импортов) | Кампания-02 п.10 (PENDING) |
| 3 | **PERF-05** | P1 | Денормализация `rankScore`/`priceFromEffective` для каталога | Ратифицировано «после публичного открытия» |
| 4 | **PERF-08** | P1 | Мультипровайдерный `ScheduleContext` (виджет студии) | Ратифицировано «после публичного открытия» |
| 5 | **PERF-01** | P1 | Статика правовых страниц | Упирается в ратифицированное (см. §5) — практически недостижимо без отката RKN-FIX-06/CSP |

P1-строк, требующих **кода прямо сейчас**, нет: №1-2 стоят в очереди кампании-02, №3-4 отложены владельцем, №5 фактически не имеет решения в текущей архитектуре.

---

## 4. Вакуумные и слабые сторожа (spot-check 5 штук)

| Сторож | Вердикт | Вход, который проходит насквозь |
|---|---|---|
| **Скоуп конфликта броней** (`bookings/conflict-scope.test.ts`) | 🔴 **был вакуумен, починен в `74173f9e`** | Две независимые дыры: (1) исключения «это чтение» были **файловыми** — `usecases.ts` числился «чтением списков броней», и одна легитимная выборка амнистировала весь файл вместе с живым конфликт-предикатом в старой парной форме; (2) утверждение «копия переведена» проверялось как `includes("buildConflictScopeWhere")` — его удовлетворяли **строка импорта и комментарий**, поэтому файл с возвращённым парным скоупом оставался зелёным. Закрыто: запрет `overlaps(` в файлах-исключениях + требование формы вызова `buildConflictScopeWhere(` |
| **Модальная конвенция** (`eslint.config.mjs:41`) | 🟠 **слабый по построению** | Правило стоит на уровне **`warn`** (комментарий: «never breaks the lint baseline»), а `npm run lint` завершается 0 при 14 warning'ах. **Любой новый** `.tsx` с `className="fixed inset-0 …"` вне exempt-списка пройдёт CI молча. Поднять до `error` нельзя без разбора существующего baseline — это отдельная задача |
| **Идентичность email** (`auth/email-identity.test.ts`) | ✅ невакуумен | Проба выполнена: замена `findVerifiedEmailProfile` на голый `findFirst` в P2002-ветке даёт **ровно один** красный тест, happy-path гонки остаётся зелёным ⇒ проба точечная |
| **Rate-limit fail-closed** (`rate-limit/sensitive-routes.test.ts:27-43`) | 🟡 **ограниченный, не вакуумный** | Утверждения парные (true для чувствительных, false для изъятий и публичного) — это настоящая проверка. Но она **перечисляет конкретные пути**, а не проверяет полноту: новый денежный роут под другим префиксом (например `/api/payments/refund-request`) без записи в `SENSITIVE_ROUTE_PREFIXES` пройдёт зелёным |
| **Tenant-scope CRM** (`bookings/client-privacy.test.ts:84`) | ✅ невакуумен | Три слоя: type-level `extends keyof` (валит `typecheck`, не тест), source-level regex и обратный guard `MASTER_CRM_READERS` = «кому можно». Новый client-facing роут краснеет просто потому, что его нет в списке |

**Вывод свипа:** из пяти проверенных один был вакуумен, один слаб по построению, один ограничен. Это подтверждает правило промпта — сторож доказательством не является, пока не показана его краснота.

---

## 5. Спорные утверждения аудитов

Отчёты — рабочие документы; ниже то, что при перечитывании не подтвердилось. Три из них имеют статус `DISPUTED` в ледже, остальные — ошибки внутри в целом верных находок.

| ID | Что заявлено | Что на самом деле |
|---|---|---|
| **PERF-15** | 63 вызова изображений без `sizes` → «прямой удар по LCP каталога» | Не разделены две ветки компонента: 38 идут `width`+`height` (дефолт `${width}px`), 25 `fill`-вызовов **все** передают адаптивный `sizes`. На `100vw` не попадает ни один. Названный главный пример (`catalog-card.tsx`) передаёт `width={400}` |
| **PERF-29** | Сборка открывает ~30 Redis-соединений, риск для CI/Docker | Опровергнуто замером по всем трём частям: без `REDIS_URL` — **0** соединений; с рабочим Redis — **одно**; названная причина (`lib/startup.ts`) уже пропускает работу в фазе сборки |
| **PERF-01** | «Минимальный шаг» — вынести правовые страницы в route-группу со своим layout | Вложенный layout **не отменяет** корневой — рецепт противоречит самой находке |
| **PERF-12** | `features={domAnimation}` для LazyMotion | `domAnimation` не содержит layout-анимаций и drag, а их используют три поверхности. Отказ — **тихий no-op**, а не ошибка |
| **PERF-05** | «Дешёвый шаг» — `take: 8` на карточных связях | Усекает `resolveMinPrice` (карточное «от X ₽» и гистограмма) и теряет услугу, совпавшую с запросом |
| **PERF-09** | Индекс I-7 как обычный `@@index([…, deletedAt, createdAt])` | Сортировку не убирает: Postgres берёт `IS NULL` как условие, но не как равенство, сохраняющее порядок ⇒ нужен **частичный** индекс сырым SQL |
| **PERF-25** | 24 файла с лишним `"use client"` | Премиса неверна: директива объявляет **границу**, а не принадлежность. 14 из 24 импортируются только из клиентских компонентов ⇒ снятие даёт ноль |
| **PERF-22** | Ссылка `notifications/service.ts:645` | В файле 629 строк; оба `findMany` там либо с клампом, либо список адресатов |
| **PERF-24** | Точка `studio/analytics/page.tsx:39-40` | Ложная: `loadStudioAnalyticsView` принимает `features` аргументом |
| **PERF-06** | Вопрос владельцу из `AUDIT-OWNER-DECISIONS` §4 | Дефект не закрывает: студийная сторона уже курсорная, мастерская показывает whole-set KPI |
| **LOGIC-05** | В UI есть кнопка `NO_SHOW` | Кнопки нет — это метка статуса. Заведено как `NO-SHOW-UI` |
| **LOGIC-22** | Generic-текст ошибки на истёкшей сессии | Не подтвердился |
| **RES-23** | 5-минутный cooldown смягчает | На пути `logError` его нет вовсе — он в `sendTelegramAlert` |
| **PERF-11** | 14 компонентов с value-импортом Prisma | Обход графа нашёл **26** |
| **UI-02** | 68 сайтов | На HEAD было **71** |
| **UI-03** | 33 замены | Фактически **34** |

---

## 6. Пересекающиеся находки — чинить один раз

| Пара | Предмет | Статус |
|---|---|---|
| **RES-04 ≡ PERF-14** | Self-fetch прокси к `/api/auth/refresh` | Закрыто один раз: RES-04 поставил границу, PERF-14 убрал хоп целиком. Гвард RES-04 переписан на «хопа нет вовсе» |
| **SEC-06 ≡ PERF-07** | Валидация и ресайз загружаемых изображений | Один примитив `readValidatedImageUpload`; `maxSidePx` обязателен **типом** |
| **SEC-22 ≡ PERF-30 (первая половина)** | Мёртвое правило Supabase в service worker | Снято в SEC-22; PERF-30 закрыл вторую половину (`/_next/image`) |
| **LOGIC-01 ↔ LOGIC-17** | Скоуп «чьё время» и окно «за какой отрезок» | Пара: скоуп без окна ставит predicate-lock на всю историю. Инв. #11 теперь читается только вместе с #31 |
| **UI-26 ↔ UI-27** | Сырые `<button>` и `dark:`-сайты | Файлы пересекаются ⇒ одна приёмка, коммит на область (кампания-02 п.8) |
| **SEC-01 ↔ SEC-02** | Email как идентификатор + килсвитч канала | Один коммит `a4b7a41b`: порознь дыра остаётся в другой форме |

---

## 7. Расхождения между леджерами и кодом

| Где | Расхождение | Класс |
|---|---|---|
| **Инв. #11** (`MASTERRYADOM_AI_CONTEXT.md`) | Утверждал «копий предиката было четыре; появление пятой валит guard». Пятая **существовала** (`usecases.ts`) и guard её не ловил | 🔴 Тот самый класс «утверждение в доке опережает диск». Исправлено в `74173f9e` |
| **`AUDIT-CAMPAIGN-PROGRESS.md`, LOGIC-01** | «все 4 копии переведены; guard ловит пятую копию» | То же расхождение, в первоисточнике. **Не исправлено** — предложение в §8 |
| **Инв. #31** | Заявлял гарантию отсутствия пересечений без указания скоупа | Исправлено в `74173f9e` (ссылка на #11) |
| **`MASTERRYADOM_AI_CONTEXT.md` §7, `EMAIL_AUTH_ENABLED`** | До 2026-08-04 строка утверждала, что переменная гейтит email-OTP, при нуле потребителей | Уже исправлено (`a4b7a41b`), в самой строке стоит признание «эта строка лгала» |
| **Инвариант про email** | `a4b7a41b` поправил §5/§7, но инвариант в §12 **не завёл** | Закрыто пост-фактум в `74173f9e` (инв. #41) |
| **`AUDIT-CAMPAIGN-PROGRESS.md`, сверка 2026-08-06** | Сам ледж фиксирует, что строки `LOGIC-23`/`LOGIC-25` стояли `PENDING` при уже лежащих в ветке фиксах | Рецидив того же класса, **уже отловленный** самим проектом |
| **`BACKLOG.md`** | `BOOKING-WINDOW-STUDIO-PATHS` отсутствовал, хотя гэп реален (`assertBookingWindow` — 0 вызовов в студийных путях) | Заведён в `74173f9e` |

**Вердикт по классу «30 маркеров pending-commit».** Паттерн **рецидивировал** — дважды за кампанию (сверка 06-08 по `LOGIC-23`/`LOGIC-25`; инв. #11 про «четыре копии»). Общее у обоих: утверждение писалось в момент намерения, а проверялось по отчёту, а не грепом по диску. Правило CLAUDE.md rule 15 («проверка грепом по маркерам в файле, никогда по отчётам») сформулировано верно, но на инварианты §12 его никто не распространял — там утверждения о **свойствах кода**, и их надо перепроверять кодом так же, как маркеры.

---

## 8. Предлагаемые правки в BACKLOG (владельцу — смержить вручную)

Свип `BACKLOG.md` не трогает. Кандидаты:

1. 🟠 **`MODAL-GUARD-TO-ERROR`** — поднять `no-restricted-syntax` для `fixed inset-0` с `warn` до `error`. Сейчас первый новый рукописный модал проходит CI молча (§4). Предварительный шаг — разобрать существующий baseline warning'ов.
2. 🔵 **`RATE-LIMIT-PREFIX-COMPLETENESS`** — сторож fail-closed перечисляет пути, а не проверяет полноту; новый денежный роут под другим префиксом пройдёт (§4).
3. 🔵 **`AUDIT-LEDGER-INVARIANT-SYNC`** — при закрытии находки, утверждающей свойство кода, перепроверять формулировку соответствующего инварианта §12 **грепом по коду**, а не по отчёту (§7).
4. Поправить строку `LOGIC-01` в `AUDIT-CAMPAIGN-PROGRESS.md`: «все 4 копии» → «пять; пятая закрыта в `74173f9e`».

---

## 9. Что этот свип НЕ делает

- Не переоткрывает находки по существу и не проверяет качество фиксов — только их наличие.
- Строки грейда `anchor` (большинство) означают «код по адресу есть, механизм не перечитан». Если цена ошибки в конкретной находке высока — перечитать точечно.
- Не покрывает находки, которых в пяти отчётах нет: кампания-02 завела свои пункты (11 штук), их статус — в `AUDIT-CAMPAIGN-02-PROGRESS.md`.
