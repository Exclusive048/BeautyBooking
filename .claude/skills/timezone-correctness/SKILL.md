---
name: timezone-correctness
description: Авторитет по отображению времени и часовых поясов в МастерРядом. Используй ВСЕГДА при работе с любым временем/датой на экране — слоты, расписание, календарь, бронирование, напоминания, «Мои записи», карточки записи, чат-таймстемпы. Триггеры — время, отображение времени, таймзона, часовой пояс, зона, слот, расписание, календарь, напоминание, уведомление о записи, бронирование, дата, GMT, UTC, salon-tz, viewer-tz, formatLocalHm, поправь время, время показывается неправильно, время в календаре, timezone, time display, timezone display, appointment time, slot time, reminder time, tz, DST.
---

# Timezone-correctness — единственный источник правды по отображению времени

> Сильнейший рецидивирующий класс багов проекта (session-audit H2, ≥9 промптов, «третий раз»):
> **время записи показывается в браузерной таймзоне зрителя (или в сыром UTC) вместо таймзоны салона** —
> клиент из другого часового пояса читает/бронирует не тот час. Этот скилл переносит знание из истории чата
> в код-обоснованную таблицу, чтобы (1) новая time-поверхность строилась с осознанным выбором tz-источника
> и (2) **намеренно** viewer-tz поверхность не «чинили» в неверную сторону.

Авторитет: при конфликте с устаревшими комментариями / памятью — побеждает **текущий код** (все ссылки ниже
верифицированы против кода на ветке `predeploy`). Дополняет `docs/QUALITY-GATES.md` (раздел «Время», rule 8).

---

## 1. Инвариант

- **Хранение — всегда UTC.** `Booking.startAtUtc` / `endAtUtc`, слоты — UTC-инстанты (CLAUDE.md rule 8). Никогда не хранить локальное время в этих полях.
- **Отображение — осознанный выбор tz-источника на КАЖДУЮ поверхность.** Три источника: **salon-tz** (tz салона/провайдера), **viewer-tz** (браузер зрителя, намеренно), **UTC-tech** (внутреннее, не user-facing). Выбор фиксируется в коде (комментарий / имя аргумента `salonTz`/`viewerTimeZone`) и в отчёте по коммиту.
- **Правило по умолчанию:** время **записи/слота/расписания** (то, что происходит в физической точке провайдера) → **salon-tz, с явной меткой** «(город, GMT+N)» когда зритель в другой зоне. Относительный/активити-таймстемп (отправлено, зашёл, N минут назад, дата отзыва) → viewer-tz — это корректно.

---

## 2. Санкционированные хелперы (только через них форматировать время записи)

| Хелпер | Файл | Что делает |
|---|---|---|
| `formatLocalHm(date, timeZone)` | `src/lib/schedule/timezone.ts:72` | Единый entity-tz «HH:MM». `timeZone` **обязателен** (нет дефолта) — нельзя случайно отформатировать в UTC/host. |
| `getLocalTimeParts` / `getDayOfWeek` / `toUtcFromLocalDateTime` / `toLocalDateKey` | `src/lib/schedule/timezone.ts` | tz-aware части / weekday / local→UTC / date-key в tz сущности. |
| `UI_FMT.timeShort / dateTimeShort / dateShort(date, { timeZone })` | `src/lib/ui/fmt.ts:61` | date+time форматтеры, `timeZone` через опции. |
| `formatZoneLabel({ iso, timeZone, city })` + `zonesDifferForViewer({ iso, salonTimeZone, viewerTimeZone })` | `src/lib/ui/zone-label.ts:138/154` | Метка «(Екатеринбург, GMT+5)» + решение показывать её (когда зритель ≠ салон). DST-aware, RU/CIS город из `TZ_CITY_RU`. |
| `utcIsoToSalonInput` / `salonInputToUtcIso` / `salonLocalDatetimeInput` | **`src/lib/schedule/datetime-input.ts`** | Единственный конвертер salon-local ↔ UTC для **`datetime-local`-ввода и prefill**. ⚠️ Переехал сюда из `features/studio-cabinet/schedule/lib/` (LOGIC-21) — мастерский quick-create не мог переиспользовать модуль из чужого слайса и оттого держал собственный host-локальный путь. Вторая копия появиться не должна. |

Эталон правильной поверхности: `src/features/client-cabinet/bookings/client-bookings-page.tsx` — `salonTz = booking.provider.timezone` → `zonesDifferForViewer` → `formatZoneLabel`.

---

## 3. Каноническая таблица (сердце скилла) — верифицировано против кода

### 3a. SALON-TZ — показывать в tz провайдера, метка при расхождении. Все ✅ корректны.

| Поверхность | file:line — вызов |
|---|---|
| master booking-card (неделя) | `master/…/schedule/booking-card-week.tsx:72` — `formatLocalHm(startAtUtc/endAtUtc, timezone)` |
| master dashboard booking-row | `master/…/dashboard/booking-row.tsx:41,44` — `formatLocalHm(…, timezone)` |
| master dashboard greeting / attention / footer-hint | `greeting-hero.tsx:96`, `attention-section.tsx:39,79,80`, `footer-hint.tsx:18` — `formatLocalHm(…, timezone)` |
| public booking wizard — when-step | `public-studio/…/steps/when-step.tsx:260` — `UI_FMT.timeShort(slot.startAtUtc, { timeZone: salonTimeZone })` + метка `:116` |
| public booking-flow + summary | `booking-flow.tsx:148/666`, `booking-summary.tsx:77,82` — salon-tz + label |
| studio/solo package flow | `studio-package-flow.tsx:84`, `package-booking-flow.tsx:218` — `UI_FMT.*({ timeZone: studio/providerTimezone })` |
| hot-slots-preview | `home/…/hot-slots-preview.tsx:198,199` — toLocale\* **с** `timeZone: provider.timezone` |
| studio calendar (day-grid + current-time-line + action-menu + breaks) | `day-grid.tsx:220,227,228`, `current-time-line.tsx:31` (`salonMinuteOfDay`), `booking-action-menu.tsx:26`, `manage-breaks-dialog.tsx:177-180` — salon-tz |
| studio bookings-journal row | `studio-cabinet/bookings/…/booking-row.tsx:37,54` — `formatLocalHm(…, timeZone)` |
| booking success-phase + time-grid | `success-phase.tsx:72,92`, `time-grid.tsx:69,102` — salon-tz + label |
| **эталон** client «Мои записи» | `client-cabinet/bookings/client-bookings-page.tsx:329-347,424` — `salonTz` + `zonesDifferForViewer` + `formatZoneLabel` |
| client reschedule-modal (слоты) | `client-bookings/client-reschedule-modal.tsx:84,153` — `formatLocalHm(new Date(slot.startAtUtc), salonTz)` |
| public master availability-hint | `public-profile/master/…/availability-hint.tsx:18` — `Intl.DateTimeFormat({ timeZone: timezone })` |
| **master** reschedule-modal (слоты + «текущее время») | `master/…/schedule/reschedule-modal.tsx` — `salonTz = context.timezone` (из `reschedule-context/route.ts`, precedence = `masterProvider ?? provider`); `UI_FMT.timeShort/dateShort({ timeZone: salonTz })` + label. TZ-DISPLAY-SALON-PARITY-01 |
| `/book` «ближайшие слоты» (dormant) | `app/book/book-client.tsx` — `detail.masterTimezone` (из `portfolio.service.getPortfolioDetail`); `UI_FMT.dateTimeShort({ timeZone })` + label. `nearestSlots` пока `[]` → correct-when-lit. TZ-DISPLAY-SALON-PARITY-01 |
| CRM client-card visit-history | `crm/components/client-card-drawer.tsx` — `cardTimeZone = card.timeZone` (= `provider.timezone`, из `crm/card-service.ts`); `UI_FMT.dateTimeShort({ timeZone })`. TZ-DISPLAY-SALON-PARITY-01 |
| studio create-booking dialog (read-only card + `datetime-local`) | `studio-cabinet/…/dialogs/create-booking-dialog.tsx` — `UI_FMT.dateTimeShort({ timeZone })` + `utcIsoToSalonInput`/`salonInputToUtcIso` (salon-local ввод, метка «время салона»). TZ-DISPLAY-SALON-PARITY-01 (FIX-4) |
| **master quick-create** (клик по пустой ячейке сетки → `?prefillTime=` → модаль → отправка) | `master/…/schedule/empty-cells-overlay.tsx` (проп `timezone`, `salonInputToUtcIso`), `week-grid-column.tsx` (проп прокинут), `master/…/dashboard/manual-booking-modal.tsx` (`utcIsoToSalonInput` + `salonInputToUtcIso` + `toLocalDateKey` для дефолта), tz из `getMasterManualBookingData().timezone` = `Provider.timezone`. **LOGIC-21** |
| studio move-booking dialog (`datetime-local`) | `studio-cabinet/…/dialogs/move-booking-dialog.tsx` — `utcIsoToSalonInput`/`salonInputToUtcIso` (round-trip UTC↔salon-local через `datetime-input.ts`; fallback `?? currentStartAtUtc` — never shift). TZ-DISPLAY-SALON-PARITY-01 (FIX-4) |
| chat system-message booking-card | `chat-window/system-message.tsx:89-98` — `salonTz = card.timezone` (= `provider.timezone`, `ThreadBookingCardDto`); `formatLocalHm(…, salonTz)` + label. FIX-TZ-SYSTEM-MESSAGE |
| catalog card «Ближайшее» (dormant) | `catalog/components/catalog-card.tsx` → `slot-precision-format.formatAvailability({ timeZone: item.timezone })` (из `catalog.service.searchCatalog`). `nextSlot` пока `null` → correct-when-lit. TZ-DISPLAY-SALON-PARITY-01 |

### 3b. VIEWER-TZ (намеренно) — **НЕ ПЕРЕВОРАЧИВАТЬ В SALON-TZ.** Это активити/относительные таймстемпы, не время записи.

| Поверхность | file:line | Почему viewer-tz корректно |
|---|---|---|
| чат: таймстемп сообщения + группировка по дням | `chat-window/message-bubble.tsx:122`, `booking-chat.tsx:260`, `chat-window/day-separator.tsx:13` (tz из `chat-shell.tsx:41`) | «когда отправлено» — событие в жизни зрителя, не в салоне |
| уведомления: время получения | studio `notification-card.tsx:14,30`, client `client-notifications-page.tsx:328` | активити-таймстемп |
| отзыв: дата публикации | `client-reviews-page.tsx:295,420` (date-only) | coarse дата события |
| приветствие «Доброе утро» | `master/lib/time-greeting.ts:6` — `getHours()` | стенные часы зрителя |
| schedule-header «обновлено HH:MM» | `studio-cabinet/…/schedule-header.tsx:130` | момент refresh-действия админа |
| coarse date-only | `studio-today-banner.tsx:21`, `master-detail-header.tsx:35` (member-since), legal-pages | грубая дата, не инстант записи |
| schedule-request: время подачи + payload-preview | `schedule-requests/…/request-card.tsx:46`; `payload-display.ts:57-88` | submission-время (активити); preview — tz-naive недельные «HH:MM» строки, не UTC-инстант |

### 3c. UTC-tech — внутреннее, не user-facing время записи

ISO в API-ответах, audit-логи, debug-вывод, `toLocalDateKey`/date-key вычисления. Не форматировать как время-для-пользователя.

---

## 4. Процедура решения (для ЛЮБОЙ новой time-поверхности)

1. **Это время записи / слота / расписания?** (происходит в физической точке провайдера) → **salon-tz, всегда с меткой** когда зритель может отличаться. Использовать `formatLocalHm(x, provider.timezone)` или `UI_FMT.*(x, { timeZone: salonTz })` + `formatZoneLabel`. **Никогда** сырой `toLocale*` / `getHours()` / `Intl.DateTimeFormat` на этом инстанте.
2. **Это относительный / активити-таймстемп?** (отправлено, зашёл, N назад, дата отзыва/уведомления) → viewer-tz норм. Пометить `// tz-ok: viewer <причина>` чтобы `check:tz` молчал и intent был виден.
3. **Хранение всегда UTC.** Отображаемая tz — осознанный выбор, зафиксированный в коде + отчёте.
4. Прогнать `npm run check:tz` — он ловит сырые render-вызовы без явного `timeZone` (viewer-tz кандидаты). НЕ ловит **неверный tz-источник** (передан `viewerTimeZone` там, где нужен `salonTz`) — это проверяется глазами по таблице выше (§3).

---

## 5. Тестовый якорь — Vision / Екатеринбург, GMT+5

> Слот **08:00Z** должен рендериться **13:00**, с меткой «(Екатеринбург, GMT+5)», **независимо** от зрителя.

Любую новую salon-tz поверхность проверять на **не-московском** провайдере (seed: Vision = Екатеринбург +5). **Тестирование только на Москве маскирует баг** — там зритель==салон, viewer-tz и salon-tz совпадают, ошибка невидима. Именно так исходный баг wizard'а прожил долго.

---

## 6. BAD / GOOD

**BAD** (канонический баг wizard'а — сырой браузер-tz, без метки):
```tsx
// ❌ startAtUtc — инстант записи; toLocaleTimeString() без timeZone = браузер зрителя.
//    Клиент из Москвы видит 11:00 для екатеринбургского слота 13:00.
<span>{new Date(slot.startAtUtc).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
```

**GOOD** (санкционированный хелпер + salon-tz + метка):
```tsx
const salonTz = provider.timezone; // Asia/Yekaterinburg
const showZone = zonesDifferForViewer({ iso: slot.startAtUtc, salonTimeZone: salonTz, viewerTimeZone });
<span>
  {UI_FMT.timeShort(slot.startAtUtc, { timeZone: salonTz })}
  {showZone && <em> {formatZoneLabel({ iso: slot.startAtUtc, timeZone: salonTz })}</em>}
</span>
// → «13:00 (Екатеринбург, GMT+5)»
```

Конкретный BAD/GOOD > абстрактных правил (подтверждённый на этом проекте урок для агентов и для YandexGPT-подсказок).

---

## 7. Known-open — НЕ считать закрытым (документировано, не исправлено)

**✅ Закрыто (перенесено в §3a — оставлено здесь как история класса):**
- `TZ-DISPLAY-DEFERRED-3` (master reschedule-modal · `/book` nearest-slots · CRM client-card visit-history) — **исправлено TZ-DISPLAY-SALON-PARITY-01**: per-surface provider-tz проброшен через DTO/context-route (`context.timezone`, `masterTimezone`, `card.timeZone`).
- studio create-booking + move dialogs (`datetime-local` в браузер-tz) — **исправлено TZ-DISPLAY-SALON-PARITY-01 (FIX-4)**: shared `datetime-input.ts` (`utcIsoToSalonInput`/`salonInputToUtcIso`) — админ правит salon-local wall-clock, конверсия обратно в UTC через salon tz; round-trip покрыт тестом (`datetime-input.test.ts`).
- catalog card «Ближайшее» (dormant) — **исправлено TZ-DISPLAY-SALON-PARITY-01**: `item.timezone` (= `provider.timezone`) в `formatAvailability`; `nextSlot` пока `null` → correct-when-lit.
- chat system-message booking-card — **исправлено FIX-TZ-SYSTEM-MESSAGE**: `card.timezone` (`ThreadBookingCardDto`) → `formatLocalHm(…, salonTz)` + label.
- Telegram-напоминание (backlog #13) — **исправлено HARDENING-09 / #13**: `bookingTelegramService.ts` теперь `formatBookingWhenLabel(startAtUtc, provider.timezone)` (salon-tz + метка), тот же helper что in-app lifecycle-путь; сырой `getUTCHours` удалён. Покрыто `format-booking-when.test.ts`.

**🟡 Открыто (новая находка TZ-DISPLAY-SALON-PARITY-01, см. BACKLOG.md):**
- **studio manage-breaks-dialog `datetime-local` ввод** — `studio-cabinet/…/dialogs/manage-breaks-dialog.tsx:37` строит значение через `getHours()`/`getMinutes()` (браузер-tz) — **тот же класс, что FIX-4** для create/move, но для диалога перерывов. Cross-tz админ создаёт перерыв не в salon-local wall-clock. **DISPLAY-часть перерывов** (`:177-180`) уже salon-tz (§3a) — открыт только **input**-путь. Фикс: применить тот же `datetime-input.ts` (`utcIsoToSalonInput`/`salonInputToUtcIso`) + метка «время салона». Вне scope PARITY-01 (не входил в 5 названных поверхностей).

---

## 8. Список запретов

- ❌ Сырой `toLocaleTimeString` / `toLocaleString` / `toLocaleDateString` / `new Intl.DateTimeFormat` / `getHours()` / `getUTCHours()` / `getMinutes()` на **времени записи/слота**. Только через `formatLocalHm` / `UI_FMT.*({ timeZone })`.
- ❌ Передавать `viewerTimeZone` туда, где инстант — время записи (нужен `provider.timezone`). `check:tz` это **не** ловит (timeZone присутствует) — ловит таблица §3.
- ❌ Показывать salon-tz время без метки, когда зритель может быть в другой зоне (`zonesDifferForViewer` → `formatZoneLabel`).
- ❌ Тестировать salon-tz поверхность только на Москве (маскирует баг — см. §5).
- ❌ «Чинить» поверхность из §3b (viewer-tz намеренно) в salon-tz — это регрессия, не фикс.
- ✅ Датаключи в tz сущности — `toLocalDateKey(now, entityTz)`, не UTC-дата.

---

_SKILL-TZ-01 (2026-07-06). Ссылки верифицированы против кода ветки `predeploy`. Хелпер `check:tz` (`npm run check:tz`) — механический review-aid к этому скиллу. `.claude/skills/` **gitignored** → скилл локальный (как hooks); чтобы шарить — раскоммитить `.claude/skills/**`._
