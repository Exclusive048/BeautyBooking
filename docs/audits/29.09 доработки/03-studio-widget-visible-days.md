# 03 · Виджет записи в студию: полоса дней не совпадает с окном записи

**Источник:** `STUDIO-WIDGET-VISIBLE-DAYS` (BACKLOG) · **Тип:** баг · **Объём:** S (с шагом 4 — ближе к M)
**Зависит от:** — (спека 07 трогает окно записи студии на соседних путях; конфликтов по файлам нет)

## Что не так
- `src/features/public-studio/studio-booking-flow/booking-flow.tsx:678` передаёт шагу «Когда» зашитое `visibleSlotDays={30}`.
- `src/features/public-studio/studio-booking-flow/components/steps/when-step.tsx:95` дополнительно режет полосу константой `STUDIO_BOOKING_DAYS_AHEAD = 60` (`src/features/booking/lib/studio-booking.ts:110`), которая ни с чем не связана: горизонт расписания — 92 дня (`SCHEDULE_HORIZON_DAYS`, `src/lib/schedule/publish-horizon.ts:15`).
- Реальное окно окошек виджета считает сервер: `GET /api/masters/[id]/availability` берёт более строгое из окон студии и мастера (`src/app/api/masters/[id]/availability/route.ts:145-166` → `stricterBookingWindow`), то есть `min(maxBookingDaysAhead студии, мастера)`, по умолчанию 90 (`prisma/schema/provider.prisma:64`). Отсюда расхождение в обе стороны: при окне студии 14 дней полоса обещает 30 дней, из которых 16 пустые; при окне 90 дней (по умолчанию) дни 31–90 выбрать нельзя вовсе, хотя окошки есть.
- Попутно: настройка «Сколько окошек вперёд» мастера студии (кабинет студии, `src/features/studio-cabinet/schedule-settings/components/visibility-tab.tsx:115-122`, подсказка «Сколько дней вперёд клиент видит свободные окошки», `text.ts:7146-7147`) виджетом студии **не применяется**: `/availability` `visibleSlotDays` не читает (намеренно — он же служит переносу, `src/lib/schedule/bookable-window.ts:26-33`), а публичный `/slots`, который его применяет (`src/app/api/public/providers/[providerId]/slots/route.ts:125-133`), виджет студии не зовёт.
- В публичном DTO провайдера (`src/lib/providers/dto.ts:58-101`) полей окна записи нет, только `cancellationDeadlineHours`.

## Что сделать
1. **Одно правило горизонта** — `publicBookingHorizonDays(policy)` в `src/lib/bookings/policy-enforcement.ts` рядом с `clampVisibleSlotsHorizon`: `min(maxBookingDaysAhead, visibleSlotDays?, SCHEDULE_HORIZON_DAYS)`, не меньше 1. Для студии `visibleSlotDays` не передаётся (у студии этой настройки в интерфейсе нет — «Правила студии» правят только `maxBookingDaysAhead`, `src/app/api/studios/[id]/route.ts:53`), для мастера передаётся.
2. **DTO студии.** В `ProviderProfileDto` добавить `bookingHorizonDays: number` (маппер `src/lib/providers/mappers.ts`, выборка `src/lib/providers/usecases.ts:53` — добавить `maxBookingDaysAhead`, `visibleSlotDays`). Число, не id — rule 12 не затронут.
3. **Виджет.** `booking-flow.tsx:678` → `visibleSlotDays={studio.bookingHorizonDays}` (переименовать проп в `horizonDays`); `when-step.tsx:95` — потолок `SCHEDULE_HORIZON_DAYS` вместо `STUDIO_BOOKING_DAYS_AHEAD`; константу `STUDIO_BOOKING_DAYS_AHEAD` удалить, а у `buildDateBounds` (`studio-booking.ts:136-143`) сделать `daysAhead` обязательным. Полоса уже горизонтально прокручивается (`when-step.tsx:155`) — 90 ячеек помещаются без правок разметки.
4. **Мастер в студии (рекомендуется, см. «Решения»).** `/api/providers/[id]/masters` (`src/app/api/providers/[id]/masters/route.ts:74`) отдаёт у каждого мастера `bookingHorizonDays = publicBookingHorizonDays({ maxBookingDaysAhead, visibleSlotDays })`; тип `StudioMaster` (`studio-booking.ts:8`) — поле. Полоса = `min(студия, выбранный мастер)`, для «Любой мастер» — `min(студия, max по мастерам услуги)`. Сервер: в `/availability` для публичного запроса (нет `?manual=1`, нет `excludeBookingId`, нет `moveBookingId`) обрезать `toKey` через `clampVisibleSlotsHorizon(toKey, provider, now, provider.timezone)` — тот же примитив, что у `/slots`; перенос и операторские окошки не обрезаются (как задокументировано в `bookable-window.ts`). Выборку `PROVIDER_SELECT` роута дополнить `visibleSlotDays`.
5. **Тесты (поведенческие):** `policy-enforcement.test.ts` — `publicBookingHorizonDays` (14/30/90/365 → 14/30/90/92, `visibleSlotDays` меньше окна → он); тест роута `/availability`: публичный запрос к мастеру с `visibleSlotDays = 7` не отдаёт окошек дальше 7-го дня салона, тот же запрос с `excludeBookingId` стороны брони — отдаёт (переносу не мешаем). Блок `@probe`: убрать обрезку → первый кейс красный; обрезать всегда → второй красный.

## Решения владельца
- Применять ли «Сколько окошек вперёд» мастера студии в виджете студии (шаг 4). Рекомендую да: подсказка настройки это прямо обещает, а сейчас значение молча игнорируется. Последствие: у мастеров, которым студия поставила меньше 30 дней, в виджете станет меньше дней с окошками — ровно по настройке. Если нет — шаг 4 не делать, а подсказку настройки в кабинете студии переписать («действует на личной странице мастера»).

## Готово, когда
- Полоса дней виджета студии кончается там же, где кончаются окошки: студия с окном 14 дней — 14 ячеек; с окном 90 — можно выбрать день 60+ и записаться.
- Числа 30 и 60 в виджете студии нет; потолок — `SCHEDULE_HORIZON_DAYS`.
- (Шаг 4) мастер студии с «Сколько окошек вперёд» = 7 не показывает окошек на 8-й день ни в полосе, ни в ответе `/availability`; перенос записи к нему дальше 7 дней по-прежнему возможен.

## Проверка
- `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`, `npx vitest run src/lib/bookings src/app/api/masters src/features/booking`, `npm run check:openapi-routes` (если в OpenAPI описан ответ `/api/providers/{id}` — добавить поле).
- Живая проверка: студия Vision (Екатеринбург) — в «Правилах студии» поставить «Максимум вперёд» 14, открыть `/u/<студия>` → «Записаться» → шаг «Когда»: 14 дней; затем 90 — выбрать день через 2 месяца, записаться гостем. Мастеру Марине в «Видимости» поставить 7 дней. Телефон 390×844 и ПК, обе темы; время окошек — в поясе салона с меткой (rule 17, не меняется).

## Документы
- BACKLOG: удалить `STUDIO-WIDGET-VISIBLE-DAYS`. BACKLOG-DONE: строка.
- Контекст: поле в публичном DTO и обрезка `/availability` — не структурный триггер по таблице rule 15; если делается шаг 4 — одна фраза в §6 «API — заметки» у `?manual=1`/`?excludeBookingId=` про то, что публичные окошки `/availability` обрезаются по «Сколько окошек вперёд» (в том же изменении).

## Риски
- Кэш профиля студии (если `/api/providers/[id]` кэшируется) — новое поле появится после сброса; проверить `Cache-Control` ответа.
- Тонкость «Любой мастер»: полоса берёт максимум, поэтому у части мастеров дальние дни будут пустыми — это корректно (окошко уйдёт тому, у кого оно есть, `mergeAnyMasterSlots`).
