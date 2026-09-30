# 24 · Форматирование дат и денег через общие модули

**Источник:** `UI-20` (`docs/audits/AUDIT-FRESH-05-ui.md` § P2; план — `AUDIT-CAMPAIGN-BLOCKED.md` § UI-20) · **Тип:** рефакторинг + 3 бага · **Объём:** L
**Зависит от:** — (метки поясов для `formatZoneLabel` правит спека 28; общих файлов со спекой 24 у неё нет)

## Что не так
Замер 2026-09-29: `.ts/.tsx`, без тестов, комментарии вырезаны.

**Общие модули.** Базовые: `lib/ui/fmt.ts` (`UI_FMT`), `lib/format.ts`, `lib/schedule/timezone.ts` (`formatLocalHm`, `toLocalDateKey`), `lib/ui/zone-label.ts`, `lib/money/kopeks.ts`. Предметные: `lib/notifications/format-booking-when.ts`, `lib/billing/deadline-label.ts`.

**Вне базовых модулей — 102 вызова `Intl.*` / `toLocale*` в 80 файлах.**
- По API: `Intl.DateTimeFormat` 34, `toLocaleString` 25, `Intl.NumberFormat` 21, `toLocaleDateString` 17, `toLocaleTimeString` 5.
- По смыслу: даты 64, числа и деньги 38.
- По областям: admin 19 · studio 18 · public 17 · `lib/` и `app/` 19 · client 11 · общее кабинетов 9 · master 6 · catalog 3.
- ≈11 вызовов — не отображение, а расчёт:
  - пояс зрителя через `resolvedOptions()`: `chat/chat-shell.tsx:41`, `chat/hooks/use-conversation-thread.ts:48`, `lib/time/use-viewer-timezone.ts:6`;
  - ключ даты через `en-US`/`en-CA` + `formatToParts` — копии `toLocalDateKey`: `analytics/domain/{cohorts.ts:30, date-range.ts:40, helpers.ts:88}`, `client-cabinet/bookings/lib/group-by-month.ts:30`, `chat/lib/format-time.ts:13`, `lib/chat/thread-grouping.ts:106`, `client-bookings-page.tsx:986`, `lib/search-by-time/service.ts:79`.

**Деньги форматируются в 13 местах, и по-разному.**
- Где:
  - главная: `home/components/{feed-group-tile.tsx:29, top-masters-section.tsx:53, hot-slots-preview.tsx:66}`;
  - каталог: `catalog/components/histogram-slider.tsx:23`;
  - кабинет мастера: пять `formatRubles` в `master/components/{analytics,clients,model-offers,profile,services}/lib/format.ts`, шестой — `lib/master/model-offers-stats.ts:73`;
  - админка: `admin-cabinet/billing/lib/kopeks.ts`, `admin-cabinet/dashboard/server/shared.ts:67`, `lib/notifications/admin-body-templates.ts:7`.
- В чём расхождения:
  - ноль: `UI_FMT.priceLabel(0)` даёт «0 ₽», а `formatRubles` мастера на значениях ≤0 даёт «—»;
  - пробел перед ₽: `moneyRUBFromKopeks` (через `Intl`) ставит неразрывный, ручные `${n} ₽` — обычный, и ₽ может уехать на новую строку.
- Сокращения — четыре конвенции:
  - `admin-cabinet/billing/lib/kopeks.ts:48` — «4.2 млн ₽», с точкой;
  - `admin-cabinet/dashboard/server/shared.ts:79` — «4,2 млн ₽», с запятой (две разные в одной админке);
  - `master/components/analytics/lib/format.ts:21` — «1.2M»/«12K»;
  - `app/login/login-showcase.tsx:26` — «1.2M»/«12k» (это счётчики).

**🔴 Баг: сумма в «Итогах недели» в 100 раз больше.** `lib/master/weekly-stats-job.ts:73` складывает `priceSnapshot` — это копейки. `lib/ui/text.ts:1096` печатает `revenue.toLocaleString("ru-RU")} ₽` без ÷100. Мастер получает «…, 450 000 ₽» вместо 4 500 ₽. К тому же форматирование живёт прямо в источнике текстов.

**🔴 Баг: копейки в промпте ИИ** (из интерфейса сейчас недостижим, §5 контекста). `app/api/master/services/[id]/suggest-description/route.ts:72` передаёт `service.price` (копейки) в `lib/ai/prompts.ts:95` как «Цена: …₽».

**🔴 Серверные даты в поясе контейнера** (rule 17, класс LOGIC-25).
- `lib/notifications/admin-body-templates.ts:131` пишет «Доступ сохранится до {дата}» без пояса и метки. Правильный путь уже есть — `billing/deadline-label.ts`.
- `studio-cabinet/dashboard/components/studio-today-banner.tsx:20` — серверный компонент печатает «сегодня» по часам контейнера. У студии в Екатеринбурге с 00:00 до 05:00 баннер показывает вчерашний день.
- Сторож `lib/billing/deadline-label.test.ts` ловит только `dateRU`, голые `toLocaleDateString` он не видит.

**Прочее.**
- Нет метки пояса: `public-studio/.../steps/master-step.tsx:113` показывает окошко в поясе салона, но без метки — rule 17 её требует.
- Мёртвые экспорты: `dateTimeRU`, `timeRU`, `minutesToHuman` (`lib/format.ts`) и `UI_FMT.totalLabel` — 0 вызовов.
- Самые плотные файлы:
  - `booking/components/booking-flow/phases/success-phase.tsx:25,31,36,48` — 4 формата;
  - `client-cabinet/bookings/client-bookings-page.tsx:616,619,620,980,986,994` — 6;
  - `studio-cabinet/*/components/*-kpi-row.tsx` — 9 счётчиков.

## Что сделать
**Главное правило.** До замены каждому сайту с датой назначить пояс по таблице скилла `timezone-correctness`:
- **salon-tz** — запись, окошко, расписание; показывать с меткой;
- **viewer-tz** — «создано», «пришло»;
- **UTC-tech** — ключи и оси.

Свести всё к одному хелперу без этого выбора — ровно класс LOGIC-25/26.

**Этап 0 — модули и сторож.** Видимых изменений нет, кроме решений 2–3.
- `UI_FMT`:
  - `priceLabel` — пробел перед ₽ по решению 2;
  - `priceLabelOrDash` — `null` или ≤0 → «—»;
  - `count(n)`, `percent(n)`, `moneyShort(kopeks)` — по решению 1;
  - форматы дат с обязательным `timeZone` для недостающих форм («пн, 29 сент», «29 сентября»).
- `lib/schedule/timezone.ts`: `toLocalMonthKey(date, tz)` и `getViewerTimeZone()` — единственное место `resolvedOptions()`. Удалить четыре мёртвых экспорта.

**Этап 1 — деньги, все области (~20 файлов).**
- 13 форматтеров заменить на `UI_FMT.*`, а где нужна точность до копеек (возвраты, биллинг) — на `moneyRUBFromKopeks`.
- Из `admin-cabinet/billing/lib/kopeks.ts` остаётся только `parseRublesToKopeks` — перенести его в `lib/money/kopeks.ts`.
- `text.ts:1096`: функция принимает готовую строку, а `weekly-stats-job.ts` передаёт `UI_FMT.priceLabel(revenue)`. Тест: 450000 копеек → «4 500 ₽».
- `suggest-description` — передавать цену в рублях.

**Этап 2 — серверные даты с явным поясом.**
- `admin-body-templates.ts` → `formatBillingDeadlineLabel`, пояс — через `resolveSubscriptionTimezone`.
- `studio-today-banner.tsx` → дата в поясе студии.
- Ключи дат → `toLocalDateKey` / `toLocalMonthKey`: `analytics/domain/*`, `group-by-month.ts`, `thread-grouping.ts`, `format-time.ts:13`, `client-bookings-page.tsx:986`.

**Этап 3 — salon-tz.** Инструменты: `formatLocalHm`, `UI_FMT.*({ timeZone })`, `formatBookingWhenLabel`; метка — `formatZoneLabel` / `zonesDifferForViewer`.
- Запись и окошки: `success-phase.tsx`, `booking-flow/components/summary-block.tsx:21`, `booking/lib/studio-booking.ts:159`, `master-step.tsx:113` (плюс метка), `when-step.tsx:112`, `hot-slots-preview.tsx:42,55`, `public-profile/master/components/availability-hint.tsx:15`.
- Кабинеты: `studio-cabinet/bookings/components/booking-row.tsx:52`, время записи в `client-bookings-page.tsx`.
- Сервер: `lib/master/public-profile-view.service.ts:381`, `lib/bookings/recent-masters.ts:215`, `lib/notifications/{service.ts:153, hot-slot-notifications.ts:27, model-notifications.ts:64}`, `lib/hot-slots/notifications.ts:22`.

**Этап 4 — viewer-tz и UTC-tech.**
- Даты создания, отзывов, уведомлений, биллинга в кабинетах (admin 8, client 4, studio 5 и др.) → `UI_FMT.*` без пояса с пометкой `// tz-ok: viewer`.
- `booking/components/operator-slot-picker.tsx:73`, `master/components/schedule/reschedule-modal.tsx:84`, `admin-cabinet/dashboard/server/charts.service.ts:34,39` (`timeZone: "UTC"` на ключе даты) → один общий UTC-хелпер.

**Этап 5 — счётчики** → `UI_FMT.count`: `*-kpi-row.tsx`, `home/components/hero-section.tsx:35`, `catalog/pages/catalog-page-client.tsx:165`, KPI админки.

**Сторож — `src/lib/ui/format-sites-inventory.test.ts`.** Комментарии вырезаются через `stripComments` (`src/lib/testing/source-scan.ts`).
- Счётчики по каждому файлу:
  - вызовы `Intl.DateTimeFormat|NumberFormat|RelativeTimeFormat`, `.toLocaleString(`, `.toLocaleDateString(`, `.toLocaleTimeString(`;
  - литерал `₽` в строках.
- Абсолютное правило, без заморозки: в `lib/ui/text.ts` нет ни `Intl.`, ни `toLocale`.
- `ALLOWED` — базовые и предметные модули, `getViewerTimeZone`, контентные файлы `features/*/content/*`; `₽` дополнительно разрешён в `text.ts`. Для каждой записи — причина.
- `FROZEN` — по файлам. Сторож краснеет, если появился новый файл, если число выросло или упало; при падении просит обновить `FROZEN`.
- Контроль машинерии — на фиксированной фикстуре:
  - находит: `new Intl.DateTimeFormat(`, `Intl.NumberFormat(` без `new`, `d.toLocaleString()`, `` `${n} ₽` ``;
  - не находит: вызов в комментарии, `Intl.PluralRules`, строку `"toLocaleString"`.
- `@probe` — каждая проба меняет одну ось:
  1. `new Date().toLocaleDateString("ru-RU")` в `features/studio-cabinet/reviews/lib/format.ts` → красный «1 → 2»;
  2. там же та же дата формой `Intl.DateTimeFormat("ru-RU").format(new Date())` → красный;
  3. `revenue.toLocaleString("ru-RU")` обратно в `text.ts` → красный по абсолютному правилу;
  4. заменить один сайт, не правя `FROZEN` → красный на падении.
- В шапке сторожа — формы, которые он не видит:
  - ручная сборка `${d.getHours()}:${…}` / `padStart` — это зона `check:tz`;
  - форматтеры `react-day-picker`;
  - деньги без ₽ и без `Intl` (`kopeks / 100` прямо в JSX).

## Решения владельца
1. **Сокращение крупных сумм.**
   - (а) По-русски везде: «4,2 млн ₽», «12 тыс ₽», с запятой — и на оси графика мастера, и в счётчиках `/login` («1,2 тыс»).
   - (б) Латиницей везде: «4.2M», «12K».
   - (в) Оставить как есть на каждой поверхности.

   **Рекомендация — (а):** продукт русскоязычный, `ru-RU` сам ставит запятую.
2. **Неразрывный пробел перед ₽ везде.** Рекомендация — да. Затрагивает 71 вызов `priceLabel`; заметно только на переносах строк.
3. **Ноль в деньгах.** «—» в таблицах, KPI и истории визитов; «0 ₽» в цене услуги. Рекомендация — да. Без этого решения перевод `formatRubles` → `priceLabel` молча заменит «—» на «0 ₽».

## Готово, когда
- `FROZEN` пуст. Вне `ALLOWED` нет ни `Intl.*`, ни `toLocale*`, ни литерала ₽. В `ALLOWED` не больше 8 модулей, у каждого указана причина.
- Тест «Итогов недели» проходит: сумма в рублях.
- На сервере нет `toLocale*` без `timeZone`: это держит сторож и ручная сверка списка этапа 2.
- Кандидатов у `npm run check:tz` не больше, чем в базе.
- Везде одна конвенция сокращений и один вид пробела перед ₽.

## Проверка
- Гейты: `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`, `npm run check:ui-text`.
- `npm run check:tz` — сравнить число кандидатов до и после.
- `npm run test`: сторож, тест ÷100, `lib/format.test.ts`, `billing/deadline-label.test.ts`, `notifications/format-booking-when.test.ts`, `features/booking/lib/studio-booking-dates.test.ts`.
- **Живая проверка salon-tz.** Провайдер — Vision (Екатеринбург, +5) из сида. Зритель — `timezoneId` Москвы или Калининграда. Экраны:
  - запись в студию (шаги и успех);
  - горящие окошки на главной;
  - «Мои записи» клиента;
  - журнал записей студии;
  - баннер «сегодня» у студии — поставить время 00:00–05:00 Екб через `page.clock.install`.
- **Живая проверка денег.** Каталог (ползунок цены), главная (лента, топ мастеров, окошки), аналитика мастера, дашборд и биллинг в админке.
- Каждый экран — 375 и 1280. Обе темы нужны только для контроля побочных эффектов: форматы от темы не зависят. Перенос ₽ проверять на телефоне.

## Документы
- `AUDIT-CAMPAIGN-BLOCKED.md` § UI-20 — закрыть. `AUDIT-CAMPAIGN-PROGRESS.md`: UI-20 → FIXED.
- `BACKLOG-DONE.md` — строка; отдельно назвать баг «Итогов недели» и две серверные даты.
- Дизайн-скилл §8: форматирование — только через `UI_FMT` / `lib/format.ts`; в `text.ts` не форматировать; принятая конвенция сокращений.
- Скилл `timezone-correctness` — новые хелперы в таблицу поверхностей.
- Контекст — триггера нет. §13 («Деньги», «Время») править, только если меняются названные там функции (`moneyRUB*`, `UI_FMT.priceLabel`, `dateRU`).

## Риски
- **Неверный пояс при механической замене** — дедлайн или окошко по чужим часам. Решать по каждому сайту и проверять на Екатеринбурге: на Москве ошибка не видна.
- **«—» превратится в «0 ₽»**, если вместо `priceLabelOrDash` взять `priceLabel`.
- **Неразрывный пробел ломает текстовые локаторы и тесты** (`getByText("4 500 ₽")` с обычным пробелом) — прогнать `.qa`-спеки этапа.
- **Hydration mismatch.** Дата без пояса на сервере и на клиенте даёт разный текст. Viewer-tz форматировать только в `"use client"` после монтирования.
