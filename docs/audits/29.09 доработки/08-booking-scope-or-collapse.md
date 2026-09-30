# 08 · Один скоуп студийных списков записей

**Источник:** `BOOKING-SCOPE-OR-COLLAPSE` (BACKLOG), инв. #45 · **Тип:** рефакторинг + данные · **Объём:** M
**Зависит от:** —

## Что не так

Списки студии ПОКАЗЫВАЮТ записи по `OR: [{ studioId }, { providerId: studio.providerId }]`, а
действие РАЗРЕШАЕТ только `{ id, studioId }` (`lib/studio/tenancy.ts:80`; так же
`auth/ownership.ts`, `media/access.ts`, `reviews/service.ts`, уведомления). Строка, у которой
`studioId` расходится с поверхностью, видна, но неуправляема — это был SMOKE-01 · F1. После FIX-C1
`studioId` выводит единственный writer `createBookingRow` (`lib/bookings/booking-row.ts:93`) из
`Studio.providerId`, то есть ветка `providerId` избыточна. BACKLOG называет два места — на деле их
**20 запросов и один предикат в памяти** (сверено грепом 2026-09-29):

- `features/studio-cabinet/bookings/server/bookings-list.service.ts:120`, `bookings-kpis.service.ts:61`
- `features/studio-cabinet/dashboard/server/dashboard-data.service.ts:98, 184, 195, 361, 430`
- `features/studio-cabinet/schedule/server/schedule-data.service.ts:122` (третья ветка — личная
  занятость мастеров, остаётся), `:212`, `:431`; предикат `isPersonalBooking` `:201-202`
- `features/studio-cabinet/clients/server/clients-data.service.ts:73`, `lib/studio/clients.service.ts:105`,
  `app/api/studio/clients/[clientKey]/card/route.ts:53`
- `features/studio-cabinet/services/server/services-data.service.ts:69, 465`
- `features/studio-cabinet/masters/server/masters-list.service.ts:121-124`
- `features/studio-cabinet/analytics/server/analytics-view.service.ts:184`, `features/analytics/domain/helpers.ts:36` (`buildScopeWhere`)
- `lib/deletion/active-bookings.ts:59`
- `lib/studio/leave-guard.ts:41` — та же пара в другой записи: `{ studio: { providerId } }` вместо `{ studioId }`

(`reviews/studio-scope.ts:16` и `studio/services.service.ts:61` — другие модели, вне задачи.)

**Инвентарь данных.** Класс строки по сравнению `Booking.studioId` с тем, что вывел бы writer:
(а) поверхность студии, `studioId` пуст — сейчас видна, неуправляема, после свёртки **пропадёт из
журнала**; (б) поверхность студии, `studioId` другой студии — после свёртки пропадёт у своей;
(в) поверхность мастера, `studioId` задан — видна и управляема студией, хотя по правилу writer'а это
личная запись; свёртка её видимость не меняет.

```sql
BEGIN READ ONLY;
WITH e AS (
  SELECT b.id, b."studioId", s.id AS expected, b.status, b.source, b."createdAt"
  FROM "Booking" b LEFT JOIN "Studio" s ON s."providerId" = b."providerId"
)
SELECT count(*) AS total,
  count(*) FILTER (WHERE "studioId" IS DISTINCT FROM expected) AS mismatched,
  count(*) FILTER (WHERE expected IS NOT NULL AND "studioId" IS NULL) AS a_studio_null,
  count(*) FILTER (WHERE expected IS NOT NULL AND "studioId" <> expected) AS b_other_studio,
  count(*) FILTER (WHERE expected IS NULL AND "studioId" IS NOT NULL) AS c_personal_with_studio
FROM e;
-- детали: тот же CTE, SELECT id, "studioId", expected, status, source, "createdAt"
-- WHERE "studioId" IS DISTINCT FROM expected ORDER BY "createdAt";
ROLLBACK;
```

**Результат на dev-БД 2026-09-29:** всего 183, расходятся **5**, все класса (а): сидовые
`seed-bk:*` от 2026-08-03 (до FIX-C1), по одной у студий «Аура», «Луна», «Олива», «Сирень»,
«Мята» (не Vision), визиты май–август, статус `FINISHED`, `source = MANUAL`. (б) = 0, (в) = 0.
Сид уже выводит `studioId` (`prisma/seeds/test-data/seed-bookings.ts:150-155`), dev-база просто не
пересевалась. Прод-инвентарь из этой среды недоступен — прогнать до деплоя (см. «Документы»).
Прод живёт с 2026-09-01, после FIX-C1, но `master-profile-split.ts:156-199` (пост-деплой
STUDIO-MASTER-PROFILES) переписывает брони `updateMany` мимо writer'а — класс (в) там возможен.

## Что сделать

1. **Данные.** Миграция данных `npm run migrate:new -- --name booking_studio_id_backfill`, SQL
   прочитать целиком до применения (rule 16):
   `UPDATE "Booking" b SET "studioId" = s.id FROM "Studio" s WHERE s."providerId" = b."providerId"
   AND b."studioId" IS DISTINCT FROM s.id;` — чинит (а) и (б), идемпотентна, на проде ожидаемо
   0 строк. Класс (в) миграция НЕ трогает (см. решения). Если `migrate:new` не проходит из-за
   досквошевой истории dev-БД — SQL пишется руками в папку миграции, на dev применяется `psql`.
   Проверить, что генератор не дописал `DROP INDEX … hnsw` (ловит `check:migration-drops`).
2. **Одно написание скоупа.** `lib/studio/booking-scope.ts`: `studioBookingsWhere(studioId: string)`
   → `{ studioId }` и `isStudioSurfaceBooking(b, studioId)`. Параметр — `string`, не optional:
   форма `{ studioId: undefined }` → match-all (класс FIX-7, `analytics/domain/helpers.ts:18-26`)
   становится ошибкой компилятора. Перевести все 21 место выше; `buildScopeWhere` без `studioId` —
   оставить `{ providerId }` только если вызывающий действительно может его не знать (проверить
   `resolveAnalyticsContext`), иначе сузить тип контекста.
3. **Сторож данных, а не текста.** После свёртки код с любой из двух веток отдаёт одни и те же
   строки — риск не в коде, а в дрейфе колонки через `updateMany` мимо writer'а. Шаг
   `deploy:post` `reportBookingStudioScopeDrift` (`scripts/post-deploy.ts`): запрос выше, при
   ненуле — `logError` со стабильным fingerprint `integrity.booking-studio-scope-drift` и
   счётчиками по классам (id — только в лог, без ПДн). Рассмотрен и отвергнут триггер БД,
   выводящий `studioId` сам: скрытое поведение, ещё один сырой объект в `raw-sql-objects.mjs`,
   а писателей мимо writer'а — три `updateMany` в одном файле.
4. Шапки `booking-row.ts:14-19` и `leave-guard.ts:17` переписать: «показывает = разрешает = `studioId`».

## Решения владельца

Для свёртки не нужны, если прод-инвентарь даёт (а) + (б) без необъяснённых строк. Нужно одно
решение, только если на проде (в) > 0: такие записи считать **личными** (`studioId → null`,
пропадут из журнала студии; правило writer'а) или **студийными** (`providerId →` провайдер студии,
как делает шаг 5 `master-profile-split.ts:171-199`). Рекомендация — смотреть по списку: запись на
студийную услугу — студийная, на свою услугу мастера — личная.

## Готово, когда

- В `src/` нет ни одной студийной выборки броней с веткой `providerId: studio.providerId`;
  журнал, календарь, KPI, клиенты, аналитика, удаление и уход мастера берут `studioBookingsWhere`.
- Инвентарный SQL на dev и проде: (а) = (б) = 0.
- `deploy:post` сообщает о дрейфе.

## Проверка

- Репродукция до фикса на dev: 5 сидовых строк видны в журнале своих студий, а
  `assertBelongsToStudio("booking", …)` на них отвечает 404 (визиты прошедшие, кнопки действий
  закрыты — проверять вызовом сервиса, не кликом).
- Детектор — поведенческая проба на живой dev-БД: до миграции/`seed:test` он находит 5 строк
  класса (а), после — 0 (`@probe` с обоими числами в шапке шага).
- `booking-studio-scope.test.ts` (инв. #45) и тесты затронутых сервисов зелёные; тест хелпера:
  `@ts-expect-error` на `studioBookingsWhere(undefined)`.
- Гейты: `typecheck`, `lint`, `check:encoding`, `check:mojibake`, `check:schema-drift`,
  `check:migration-drops`.
- Живая: кабинет Vision (`+7 999 200 00 00`) — журнал, календарь (личная занятость мастера видна
  как занятость), дашборд, клиенты, аналитика — числа до и после совпадают; ПК + телефон.

## Документы

- BACKLOG — удалить пункт; BACKLOG-DONE — строка.
- Контекст (миграция, rule 15): §4 — счётчик миграций и строка про бэкфилл; §12 инв. #45 — убрать
  «пара избыточна… `BOOKING-SCOPE-OR-COLLAPSE`», записать «скоуп студии — `studioId`».
- DEPLOY-BACKLOG — пункт «до деплоя: инвентарный SQL на проде, при (в) > 0 — к владельцу».
- Попутно завести в BACKLOG: `BookingServiceItem.studioId` не читает никто (греп по `src/`), а
  пишется непоследовательно — на dev 3 из 174 строк расходятся со своей бронью. Удалить колонку
  или начать писать её в writer'е.

## Риски

- Строка, пропущенная бэкфиллом, после свёртки исчезает из журнала молча — поэтому детектор в
  `deploy:post` обязателен, а свёртка идёт ПОСЛЕ миграции в том же деплое (миграции в `deploy.yml`
  идут до `up -d`).
- `schedule-data.service.ts:122` держит третью ветку (личная занятость) — её не трогать.
