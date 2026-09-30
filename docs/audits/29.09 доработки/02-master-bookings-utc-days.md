# 02 · Записи режутся по UTC-суткам, а не по суткам салона

**Источник:** `MASTER-BOOKINGS-API-UTC-DAYS` (BACKLOG) + найдено при проверке: живой журнал студии · **Тип:** баг · **Объём:** S
**Зависит от:** —

## Что не так

### Пункт бэклога: `GET /api/master/bookings` — мёртвый код
`src/app/api/master/bookings/route.ts:52-58` строит день как `${date}T00:00:00.000Z … T23:59:59.999Z`, «сегодня» — `now.toISOString().slice(0, 10)`: у мастера в GMT+5 записи 00:00–05:00 по салону уходят в предыдущий день. Но у этого `GET` **нет ни одного вызывающего**: grep по `src/`, `.qa/`, `scripts/` находит только `POST` (`src/features/master/components/dashboard/manual-booking-modal.tsx:104`) и `/{id}/status`; в OpenAPI описан только `post` (`src/lib/openapi/spec.ts:3924`). Кабинет мастера (канбан, главная, расписание) читает записи сервисами (`src/lib/master/bookings.service.ts`, `dashboard.service.ts`), и там сутки уже салонные (`toLocalDateKey(…, timeZone)`, `bookings.service.ts:112`, `dashboard.service.ts:194`). У того же `GET` есть и другие дефекты (поиск и пост-фильтр после `take` — страница короче лимита, курсор по `id` при сортировке по времени), чинить которые незачем.

### Найдено рядом: журнал записей студии — живой и с той же ошибкой
- `src/features/studio-cabinet/bookings/lib/time-range-filter.ts:9-43` — чипы «Сегодня / Завтра / Неделя» в `/cabinet/studio/bookings` режут по UTC-полуночи (`startOfUtcDay`), комментарий `:24-25` прямо говорит «no timezone normalisation is needed». Вызов без пояса — `bookings-list.service.ts:124` и счётчики чипов `:151-153`, хотя пояс студии тут же прочитан (`:117`).
- `src/features/studio-cabinet/bookings/server/bookings-kpis.service.ts:65-69` — плитки «Сегодня», «Выручка сегодня», «Ближайшие 7 дней», «Неявки за 7 дней» — те же UTC-сутки; пояс студии не выбирается (`:43-46`).
- `src/features/studio-cabinet/dashboard/server/dashboard-data.service.ts:177-178` — баннер «Сегодня в студии — N записей» и загрузка «сегодня» (`buildTodayBanner`), UTC-сутки.

Воспроизвести: студия в Екатеринбурге (seed Vision, GMT+5), запись на 03:00 по салону завтрашнего дня; в 22:00 по салону открыть журнал — запись видна в «Сегодня» (её UTC-время — сегодня 22:00 UTC), а в «Завтра» её нет; с 00:00 до 05:00 по салону «Сегодня» показывает вчерашние записи.

Не в этой спеке: 30-дневные окна метрик (`masters-list.service.ts:84`, `master-detail.service.ts:117`, `services-data.service.ts:63/460`, `dashboard-data.service.ts:229/297`) — сдвиг на несколько часов на краю 30 дней смысла цифр не меняет; админка (`admin-cabinet/*`) — UTC-tech осознанно.

## Что сделать
1. **Удалить `GET` из `src/app/api/master/bookings/route.ts`** (схему `listQuerySchema`, тип `BookingListItem`, неиспользуемые импорты `resolveBookingRuntimeStatus`, `masterPerformedBookingWhere`, `getMasterWorkProfiles`, `parseQuery`, `z`); `POST` остаётся. Прецедент — STUDIO-MASTER-SPLIT-01 и SCHEDULE-LEGACY-API-REMOVAL удаляли API без вызовов из интерфейса. Перед удалением повторить grep по `api/master/bookings` без `/{id}` (вдруг появился вызывающий) — если появился, вместо удаления перевести дни на `localDayRangeUtc(dateKey, tz)` (`src/lib/schedule/dateKey.ts:39`), где `tz` — пояс личного профиля мастера (как `dashboard.service.ts`), «сегодня» — `toLocalDateKey(now, tz)`.
2. **Журнал студии.** `time-range-filter.ts`: `bookingsTimeRangeBounds(range, now, timeZone)` — пояс обязательный аргумент; «сегодня» = `toLocalDateKey(now, timeZone)`, границы — `localDayRangeUtc(key, tz).startUtc` и `localDayRangeUtc(addDaysToDateKey(key, n), tz).startUtc` (`dateKey.ts:39,49`). Своей арифметики дат не заводить. Заменить комментарий `:21-26` на tz-источник: **salon-tz** (пояс студии, rule 17). Модуль импортируется клиентскими компонентами только как `import type` (`bookings-filters.tsx:11`, `studio-bookings-page.tsx:3`) — `dateKey.ts`/`timezone.ts` client-safe, граница не страдает.
3. `bookings-list.service.ts:124,151-153` — передать `timezone` (уже есть, `:117`).
4. `bookings-kpis.service.ts` — выбрать `provider: { select: { timezone: true } }`, все пять границ (`:65-69`) считать от салонного «сегодня» тем же хелпером (`addDaysToDateKey` для −6, +7, −29).
5. `dashboard-data.service.ts:177-178` — баннер «сегодня» по поясу студии (провайдер студии уже известен в `StudioContext`; пояс добавить в контекст или выбрать рядом). Локальные `startOfDayUtc`/`addUtcDays` оставить только для 30-дневных окон либо удалить, если перестанут использоваться.
6. Тест `time-range-filter.test.ts` (поведенческий): студия `Asia/Yekaterinburg`, `now = 2026-09-29T20:30Z` (01:30 30-го по салону) → «Сегодня» = `[2026-09-29T19:00Z, 2026-09-30T19:00Z)`, «Завтра» и «Неделя» — от той же точки; для `Europe/Moscow` в 12:00Z — `[…T21:00Z предыдущего дня, …)`. Блок `@probe`: вернуть `startOfUtcDay` → тест красный с наблюдённым текстом.

## Решения владельца
Не нужны. (Удаление мёртвого `GET` — технический шаг по прецеденту; если владелец хочет держать его для будущего мобильного клиента — делать вариант из шага 1 «вместо удаления».)

## Готово, когда
- `GET /api/master/bookings` удалён (или считает сутки салона — если нашёлся вызывающий), `POST` работает.
- Чипы «Сегодня/Завтра/Неделя», их счётчики, плитки KPI журнала и баннер главной студии считают сутки в поясе студии.
- В `src/features/studio-cabinet/bookings/` не осталось `startOfUtcDay`.

## Проверка
- `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`, `npm run check:openapi-routes` (файл роута остаётся — гейт не меняется), `npx vitest run src/features/studio-cabinet src/lib/rate-limit` (там пин `fail-closed-classes.test.ts` упоминает `/api/master/bookings` — `POST` остаётся, пин должен остаться зелёным).
- `npm run check:tz` — как review-aid.
- Живая проверка: роль студии Vision (Екатеринбург, `+7 999 200 00 00`), журнал `/cabinet/studio/bookings` и главная — с часами машины, выставленными на 00:30–04:30 по Екатеринбургу (или временная запись на 03:00 завтрашнего дня); телефон и ПК; мастер Анна (Москва) — ручная запись из модали (`POST`) создаётся.

## Документы
- BACKLOG: удалить `MASTER-BOOKINGS-API-UTC-DAYS`. BACKLOG-DONE: строка (удалён мёртвый GET + журнал и KPI студии по салонным суткам).
- Контекст: счётчик API-роутов не меняется (файл роута остаётся). Упоминаний `GET /api/master/bookings` в `MASTERRYADOM_AI_CONTEXT.md` нет — проверить грепом; структурного триггера нет.

## Риски
- Ноль вызывающих `GET` проверяется грепом — внешнего клиента нет (мобильного приложения нет, `MOBILE-API` в BACKLOG — про гостевую бронь).
- Смена границ «сегодня» поменяет числа в журнале и на главной студии у студий не в Москве — это и есть исправление; предупредить владельца в отчёте.
