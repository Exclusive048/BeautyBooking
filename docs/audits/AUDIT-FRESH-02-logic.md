# AUDIT-FRESH-02 — Бизнес-логика, гонки, защита от дурака — Отчёт

> Дата: **2026-08-04** · Ветка: `main`, рабочее дерево на `5a37b0a` (чистое) · Режим: **READ-ONLY**
> Один из пяти параллельных аудитов «свежим взглядом» перед запуском.
> Изменённых файлов в репозитории: **1** (этот отчёт). `BACKLOG.md` намеренно не тронут — предлагаемые строки лежат в отдельной секции ниже.

---

## Метод (что осмотрено, какие команды/grep'ы прогнаны)

**Прочитано целиком (не по диагонали):**
`src/lib/bookings/{createBooking,createClientBooking,booking-core,confirmBooking,cancelBooking,decline-reschedule,usecases,flow,policy-enforcement,package-booking,package-math,idempotency,slot-invalidation}.ts` ·
`src/lib/studio/bookings.service.ts` ·
`src/lib/schedule/{usecases,slotsCache,editor,engine-context,time-blocks}.ts` ·
`src/lib/reviews/service.ts` (создание отзыва + пересчёт рейтингов) ·
`src/lib/idempotency/idempotency.ts` ·
`prisma/schema/{booking,review,schedule,enums,provider}.prisma` ·
роуты `api/bookings/[id]/{cancel,confirm,decline-reschedule,reschedule}`, `api/master/bookings/[id]/status`, `api/public/bookings`, `api/public/packages/[id]/book`, `api/studio/bookings`, `api/cabinet/master/schedule`, `api/model-applications/[applicationId]/confirm`, `api/billing/{checkout,renew/run}` ·
страницы `(public)/u/[username]/page.tsx`, `(public)/u/[username]/booking/page.tsx` ·
`src/features/booking/components/booking-flow/booking-flow-stepper.tsx` ·
`src/features/studio-cabinet/schedule/server/schedule-data.service.ts`.

**Ключевые grep'ы (все read-only):**

| Цель | Команда |
|---|---|
| Все точки записи статуса брони | `grep -rn 'status: "CONFIRMED"\|"REJECTED"\|"CANCELLED"\|"PENDING"\|"CHANGE_REQUESTED"' src/lib src/app --include=*.ts` |
| Скоуп conflict-проверок | `grep -n "masterProviderId" src/lib/bookings/booking-core.ts src/lib/schedule/usecases.ts` |
| Enforcement `lateCancelAction` | `grep -rn "lateCancelAction" src/ prisma/schema/` |
| Enforcement `slotPrecision`/`slotStepMin` | `grep -rn "slotPrecision\|slotStepMin" src/ prisma/schema/` |
| Guard пакетного ребёнка | `grep -rn "bookingPackageId" src/lib/studio/ src/app/api/master/bookings/` → **0 совпадений** |
| Идемпотентность на клиенте | `grep -rn "x-idempotency-key" src/` → **1** отправитель |
| NO_SHOW-пути | `grep -rn "NO_SHOW" src/` |
| Локи биллинг-крона | `grep -rn "acquireLock\|SETNX\|withLock\|advisory" src/app/api/billing/ src/lib/billing/` → **0** |
| Таймзоны | `npm run check:tz` (read-only review-aid; проверено в `scripts/check-tz.mjs:120-121`, что он только печатает и `process.exit(0)`) → 30 кандидатов в 27 файлах, разобраны вручную |

**Параллельно отработали четыре подагента** (billing/idempotency, queue/worker, формы/двойной сабмит, timezone). Их находки сведены ниже и перепроверены выборочно вручную (checkout `create()` вне try/catch и renew-cron без outer-try — перечитаны глазами).

**Что НЕ проверялось (вне scope):** UI-полиш, производительность (проход 04), инфраструктурные отказы (03), security-матрица (01). Живой прогон в браузере не делался — вывод строится на коде и схеме.

---

## Таблица переходов стейт-машины брони

**Persisted-статусы** (`prisma/schema/enums.prisma:98-120`): `NEW · PENDING · CONFIRMED · CHANGE_REQUESTED · REJECTED · IN_PROGRESS · PREPAID · STARTED · FINISHED · CANCELLED · NO_SHOW`.

**Runtime-нормализация** (`src/lib/bookings/flow.ts:30-59`) — read-time, в БД не пишется:
`NEW→PENDING` · `PREPAID→CONFIRMED` · `STARTED→IN_PROGRESS` · `CANCELLED|NO_SHOW→REJECTED`; плюс по времени: `now ≥ start → IN_PROGRESS`, `now ≥ start + duration + 60 мин → FINISHED`.
⚠️ `IN_PROGRESS` и `FINISHED` **никогда не персистятся** — это вычисляемые состояния (комментарий в `flow.ts:11` это фиксирует).

| Из | В | Кто инициирует | Guard | Файл:строка | Транзакция / изоляция |
|---|---|---|---|---|---|
| — | `PENDING` \| `CONFIRMED` | клиент/гость (публичный виджет) | `resolveBookingCore` (услуга активна, окно, availability-slot exact-match, acceptNewClients) + `ensureNoConflicts` | `createBooking.ts:177-266` | `$transaction` **Serializable** ✅ |
| — | `PENDING` \| `CONFIRMED` | клиент (legacy slotLabel-путь) | то же | `createClientBooking.ts:158-244` | Serializable ✅ |
| — | `PENDING` \| `CONFIRMED` | клиент (solo-пакет, N броней) | `resolveBookingCore` ×N + `intraPackageOverlap` + `ensureNoConflicts` ×N | `package-booking.ts:481-545` | Serializable ✅ |
| — | `PENDING` \| `CONFIRMED` | клиент (studio-пакет) | + `intraPackageOverlapMultiMaster` | `package-booking-studio.ts:289-340` | Serializable ✅ |
| — | `PENDING` | **studio-admin вручную** | work-hours (salon-tz) + conflict + TimeBlock. **Availability/booking-window НЕ проверяются** | `studio/bookings.service.ts:248-322` | Serializable ✅ (скоуп предиката дефектен — LOGIC-01) |
| — | `CONFIRMED` | клиент (подтверждение модель-оффера) | форкнутая inline-проверка конфликтов; **`assertNoTimeBlockConflict` НЕ вызывается** | `api/model-applications/[applicationId]/confirm/route.ts:256-297` | Serializable ✅ |
| `PENDING` | `CONFIRMED` | MASTER (studio-admin допускается как MASTER) | `runtimeStatus === PENDING && actor === "MASTER"` | `confirmBooking.ts:103-106` | Serializable, но **UPDATE без status в WHERE** — LOGIC-02 |
| `CHANGE_REQUESTED` | `CONFIRMED` (+ применяется `proposed*`) | сторона из `actionRequiredBy` | `actionRequiredBy === actor` + conflict-recheck (exclude-self) + TimeBlock | `confirmBooking.ts:107-113, 145-204` | Serializable, WHERE без status — LOGIC-02 |
| `CHANGE_REQUESTED` | `CONFIRMED` (revert, время не меняется) | сторона из `actionRequiredBy` | `actionRequiredBy === actor` | `decline-reschedule.ts:42-60` | **без транзакции**, WHERE без status |
| `CHANGE_REQUESTED` | `CONFIRMED` (revert) | CLIENT отклоняет мастерский перенос | `requestedBy === MASTER && actionRequiredBy === CLIENT` | `cancelBooking.ts:67-71, 92-118` | default-изоляция, WHERE без status |
| `PENDING` \| `CONFIRMED` | `CHANGE_REQUESTED` | CLIENT или MASTER | `ensureBookingActionWindow` (60 мин) + `assertBookingWindow` + лимит 3 + conflict (вне tx, advisory) | `usecases.ts:140-294` | **без транзакции**, WHERE без status. **Длительность окна не пересчитывается** — LOGIC-03 |
| `PENDING` \| `CONFIRMED` | `REJECTED` | CLIENT или PROVIDER | `canCancelOrReschedule` + (для CLIENT) 60 мин + `cancellationDeadlineHours`; **package-child → 409** | `cancelBooking.ts:44-118` | default-изоляция, WHERE без status |
| `PENDING`\|`CONFIRMED`\|`CHANGE_REQUESTED` | `REJECTED` \| `CANCELLED` \| `NO_SHOW` | MASTER / studio-admin | `belongsToMaster` + `ensureBookingActionWindow` (только REJECT/CANCEL) + обязательный комментарий. **Guard пакета отсутствует** — LOGIC-04 | `studio/bookings.service.ts:697-723` | default-изоляция, WHERE без status |
| N×`PENDING`\|`CONFIRMED` | N×`REJECTED` + `BookingPackage → CANCELLED` | CLIENT или MASTER | guard по самому раннему живому ребёнку | `package-booking.ts:657-680` | default-изоляция |
| любой | `IN_PROGRESS` / `FINISHED` | — | **недостижим как persisted-переход** | `flow.ts:56-58` | — |

### Достижимые «не по порядку» переходы

1. **`REJECTED → CONFIRMED` (воскрешение отменённой брони).** Ни один переход не ставит ожидаемый статус в `WHERE`. `confirmBooking` читает статус на строке 61 **вне** транзакции, а обновляет на строке 181 по `where: { id: bookingId }`. Если между чтением и коммитом другой запрос отменил бронь, отмена молча перезаписывается. → **LOGIC-02**.
2. **`REJECTED → CHANGE_REQUESTED`** — тот же механизм в `usecases.ts:258-272` (`prisma.booking.update({ where: { id: booking.id } })`, вообще без транзакции).
3. **`NO_SHOW` до начала приёма, и только до него.** `updateMasterBookingStatus` отбрасывает `IN_PROGRESS`/`FINISHED` (`studio/bookings.service.ts:677-679`) **до** ветки записи статуса, а `input.status === "NO_SHOW"` не попадает ни в `isRejectAction`, ни в `isCancelAction`. Итог: отметить неявку можно **только пока приём ещё не начался**, а после его начала — уже нельзя. Семантика вывернута. → **LOGIC-05**.
4. **Отмена одного компонента пакета мастером.** `cancelBooking` блокирует lone-child (строки 44-51), но `updateMasterBookingStatus` — параллельный путь без этого guard'а. → **LOGIC-04**.

### Прямые записи статуса в обход доменного слоя (CLAUDE.md rule 5)

Проверено `grep -rn 'status: "…"' src/lib src/app --include=*.ts`. **Нарушений нет**: все записи `Booking.status` сосредоточены в `cancelBooking.ts`, `confirmBooking.ts`, `decline-reschedule.ts`, `usecases.ts`, `package-booking.ts`, `studio/bookings.service.ts`. Единственная запись вне `src/lib` — создание брони в `api/model-applications/[applicationId]/confirm/route.ts:277-296` (это create, не переход), и там же **форкнута** conflict-проверка вместо `ensureNoConflicts` → **LOGIC-06**.

---

## Инварианты без DB-констрейнтов (список гэпов)

| # | Бизнес-инвариант | Где живёт | DB-констрейнт | Что может сохранить баг/гонка |
|---|---|---|---|---|
| G1 | **Брони одного мастера не пересекаются** (инв. #11) | только `ensureNoConflicts` (`booking-core.ts:99-158`) и 4 форка | ❌ нет ни `EXCLUDE USING gist (… WITH &&)`, ни unique. `prisma/schema/booking.prisma:125-134` — только `@@index` | Две пересекающиеся активные брони. Serializable закрывает гонку **только внутри одного скоупа предиката**; при разных `providerId` предикаты не пересекаются → SSI молчит (LOGIC-01) |
| G2 | **Один `ScheduleOverride` на (provider, date)** | check-then-insert в `editor.ts:174-213` | ❌ нет `@@unique([providerId, date])` (`schedule.prisma:124-126` — только индексы) | Дубликаты override'ов. `resolveMasterWorkWindow` берёт `findFirst` **без `orderBy`** (`studio/bookings.service.ts:76-79`), а движок держит список (`engine-context.ts:56`) → guard и генератор слотов расходятся |
| G3 | **`TimeBlock.masterId` указывает на существующего провайдера** | код | ❌ `masterId String` без `@relation` (`schedule.prisma:186`) | Блок-«сирота» после удаления мастера; каскады не срабатывают |
| G4 | **`endAtUtc − startAtUtc == durationSnapshotMin`** | только на create-пути (exact-match слота, `booking-core.ts:377-382`) | ❌ нет CHECK | Reschedule пишет `proposed*` без пересчёта → окно и снапшот длительности расходятся (LOGIC-03) |
| G5 | **`Σ BookingServiceItem.priceSnapshot == BookingPackage.totalKopeks`** (инв. #34) | `package-math.ts` (largest-remainder, точно) | ❌ нет | Отмена одного ребёнка через master-status ломает сумму (LOGIC-04) |
| G6 | **Неотрицательные/положительные числа** (`priceSnapshot ≥ 0`, `durationSnapshotMin > 0`, `rating 1..5`) | Zod + ручные проверки | ❌ нет CHECK ни на одном (`booking.prisma:154-156`, `review.prisma:28`) | Прямая запись/миграция/новый путь сохранит отрицательную длительность |
| G7 | **`Provider.ratingAvg/ratingCount` соответствуют активным отзывам** | `recalculateTargetRatings` (`reviews/service.ts:223-263`) внутри tx с **default-изоляцией** | ❌ нет | Два конкурентных отзыва: каждый агрегирует до коммита другого → счётчик занижен (LOGIC-11) |
| G8 | **Один активный отзыв на бронь** | код + БД | ✅ **есть** — `Review.bookingId @unique` (`review.prisma:5`), P2002 маппится в 409 (`reviews/service.ts:486-488`) |
| G9 | **`BillingPayment.idempotenceKey` уникален** | код + БД | ✅ **есть** (`billing.prisma:158`) — но P2002 нигде не ловится, см. LOGIC-07/-08 |
| G10 | **`MrrSnapshot` — один на дату** | код + БД | ✅ **есть** (`billing.prisma:208`) + корректный catch P2002 (`mrr-snapshot.ts:135-150`) |
| G11 | **`ChatMessage` системное сообщение — одно на (booking, event)** | БД | ✅ **есть** — `@@unique([referencedBookingId, systemEventKey])` (`booking.prisma:267`) |
| G12 | **Одно in-app уведомление на (user, type, booking)** | только application-level | ❌ `notification.prisma:34-37` — только индексы. Дедуп read-then-write (TOCTOU) в `notifications/service.ts:644-656`, а в `deliverNotification` и `dispatchAdminInitiatedNotification` его нет вообще |

---

## Находки

### P0 🔴

---

#### LOGIC-01 — Conflict-проверка брони скоупится по `providerId`, а один и тот же мастер имеет брони под ДВУМЯ разными `providerId` → детерминированный double-booking

**Файлы:**
- `src/lib/bookings/booking-core.ts:116-118`
- `src/lib/studio/bookings.service.ts:250-259` (create) и `:514-524` (move)
- `src/lib/schedule/usecases.ts:310-315` (контрпример — корректный скоуп)
- `src/features/studio-cabinet/schedule/server/schedule-data.service.ts:103-108`
- `src/app/api/public/bookings/route.ts:70-79`

**Доказательство.**

Авторитетный in-tx предикат конфликта скоупится по паре `(providerId, masterProviderId)`:

```ts
// src/lib/bookings/booking-core.ts:116-118
const conflictWhere = input.masterProviderId
  ? { providerId: input.providerId, masterProviderId: input.masterProviderId }
  : { providerId: input.providerId };
```

Генератор слотов при этом скоупится **только по мастеру**, `providerId` в предикате не участвует:

```ts
// src/lib/schedule/usecases.ts:310-315
const bookings = await prisma.booking.findMany({
  where: {
    OR: [
      { masterProviderId: providerId },
      { masterProviderId: null, providerId },
    ],
```

`TimeBlock` тоже мастер-скоупный и это явно задокументировано (`time-blocks.ts:50-53`: *«Keyed on `masterId` only (never `studioId`): a master's blocked time is the master's time regardless of which studio created it»*). То есть в проекте уже принято правило «время мастера — это время мастера», и `ensureNoConflicts` — единственное место, которое его нарушает.

Мастер-член студии имеет брони под двумя разными `providerId`:

| Поверхность | `providerId` | `masterProviderId` | `studioId` |
|---|---|---|---|
| Публичный профиль мастера → `POST /api/public/bookings` (`createBooking`) | **Марина** | Марина | `null` |
| Студийный кабинет → `POST /api/studio/bookings` (`createStudioBooking`) | **провайдер студии** | Марина | студия |

Что это достижимо через обычный UI (а не только прямым API-вызовом):
- публичный роут явно пропускает мастеров с `studioId != null` — `studioId` в `select`, но нигде не используется для отказа:
  ```ts
  // src/app/api/public/bookings/route.ts:72-79
  select: { id: true, type: true, isPublished: true, studioId: true },
  ...
  if (provider.type !== ProviderType.MASTER) {
    return jsonFail(400, "Этот мастер принимает записи через студию.", "VALIDATION_ERROR");
  }
  ```
- профиль `/u/[username]` рендерит виджет с `providerId = provider.id` мастера без каких-либо studio-гейтов (`src/app/(public)/u/[username]/page.tsx:415`), а `booking-flow-stepper.tsx:340` шлёт этот `providerId` в `/api/public/bookings`;
- сид явно создаёт таких мастеров: `prisma/seeds/test-data/seed-showcase-studio.ts:432,454` (`isPublished: true` у мастеров студии), а `seed-studio-qa.ts:107` требует `{ studioId, type: MASTER, ownerUserId ≠ null, isPublished: true }`.

**Два последствия, из них одно — без всякой гонки:**

1. **Детерминированный double-booking из студийного кабинета.** `createStudioBooking` **не делает availability-проверку вообще** (в отличие от `resolveBookingCore`, где `hasSlot` сравнивается с генератором слотов — `booking-core.ts:362-389`). Его единственная защита — in-tx предикат `{providerId: studio.providerId, masterProviderId: master.id}` (`bookings.service.ts:251-253`), который брони, созданные через личный профиль Марины (`providerId = Марина`), **не видит**. Гонка не нужна: студийный админ просто создаёт бронь поверх существующей.

   Усугубляющий фактор — админ её **и не видит на календаре**:
   ```ts
   // src/features/studio-cabinet/schedule/server/schedule-data.service.ts:103-108
   prisma.booking.findMany({
     where: {
       OR: [{ studioId }, { providerId }],   // providerId = провайдер СТУДИИ
   ```
   у брони с личного профиля `studioId = null` и `providerId = Марина` — она не матчится ни одним клозом. Календарь показывает слот свободным.

   `moveStudioBooking` (`:514-524`) — тот же дефект скоупа.

2. **Гонка, которую Serializable НЕ ловит.** Для остальных путей (`createBooking` ↔ `createStudioBooking`) сериализуемость не помогает: транзакции читают **непересекающиеся** множества строк (`providerId = Марина` против `providerId = студия`), read-write-зависимости между ними нет → PostgreSQL SSI не находит цикла, `P2034` не возникает, обе транзакции коммитятся. Предварительная availability-проверка, которая маскирует последовательный случай, живёт **вне** транзакции и читает Redis-кэш слотов (`usecases.ts:381`, TTL 120 с) — то есть именно тем свойством, ради которого делают in-tx re-check, она не обладает.

**Импакт.** Два клиента приходят на одно кресло в одно время. Инвариант #11 нарушен без гонки. Автоматического пути починки нет — конфликтующие строки уже в БД. Студийный админ не имеет способа увидеть проблему до прихода клиента.

**Направление фикса.**
1. Привести `ensureNoConflicts` к **мастер-скоупу**, идентичному генератору слотов: `OR: [{ masterProviderId: X }, { masterProviderId: null, providerId: X }]`, где `X = masterProviderId ?? providerId`. Это ровно предикат `usecases.ts:310-315` — общий helper, а не пятая копия.
2. Заменить форки в `createStudioBooking` / `moveStudioBooking` / `model-applications/confirm` на общий `ensureNoConflicts` (у move — вариант с exclude-self).
3. Расширить запрос календаря студии (`schedule-data.service.ts:105`) третьим клозом `{ masterProviderId: { in: masterIds } }`, иначе админ по-прежнему не видит занятость своих мастеров.
4. Отдельным шагом — DB-констрейнт как последняя линия (btree_gist + `EXCLUDE USING gist (master_key WITH =, tsrange(startAtUtc,endAtUtc) WITH &&) WHERE (status NOT IN (...))`); это единственная защита, которую нельзя обойти новым путём записи. Объект сырого SQL → в реестр `scripts/raw-sql-objects.mjs` (см. §9 контекста).
5. Продуктовое решение (владельцу): должен ли мастер студии вообще принимать брони через личный профиль. Если нет — гейт в `api/public/bookings/route.ts` по `provider.studioId`, и тогда п. 1-4 всё равно нужны как defense-in-depth.

**Трудоёмкость:** M (п. 1-3), L если делать DB-констрейнт.

---

### P1 🟠

---

#### LOGIC-02 — Ни один переход статуса брони не проверяет ожидаемый статус в `WHERE` → отменённая бронь воскресает в CONFIRMED

**Файлы:** `src/lib/bookings/confirmBooking.ts:61-75, 181-201` · `decline-reschedule.ts:24-60` · `usecases.ts:111-137, 258-272` · `cancelBooking.ts:21-37, 92-118` · `studio/bookings.service.ts:639-651, 705-723`

**Доказательство.** Все пять переходов устроены одинаково: сначала read вне транзакции, потом безусловный update по id.

```ts
// confirmBooking.ts:61  — чтение статуса ВНЕ транзакции
const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true, … } });
…
// confirmBooking.ts:181-201 — запись; в WHERE только id
return tx.booking.update({
  where: { id: bookingId },
  data: { status: "CONFIRMED", actionRequiredBy: null, … },
```

```ts
// decline-reschedule.ts:49-51 — вообще без транзакции
const updated = await prisma.booking.update({
  where: { id: booking.id },
  data: { status: "CONFIRMED", proposedStartAt: null, … },
```

```ts
// usecases.ts:258-260
const updated = await prisma.booking.update({
  where: { id: booking.id },
  data: { status: "CHANGE_REQUESTED", proposedStartAt: input.startAtUtc, … },
```

Serializable в `confirmBooking` здесь не помогает: транзакция **не читает** строку брони (чтение было раньше, снаружи), она читает только *другие* брони и TimeBlock'и. Read-write-зависимости со строкой брони нет → SSI не видит конфликта. Отмена (`cancelBooking`, default-изоляция) успевает закоммититься, после чего confirm перезаписывает `REJECTED` на `CONFIRMED`.

**Воспроизводимая последовательность:** клиент открывает «Мои записи» и жмёт «Отменить»; мастер в это же время в своём кабинете жмёт «Подтвердить» (кнопка была отрендерена до отмены). Гонки в миллисекунды не требуется — достаточно, чтобы вкладка мастера была открыта до отмены, а `cancelBooking` закоммитился между чтением `confirmBooking.ts:61` и его апдейтом.

**Импакт.** Бронь, которую клиент отменил, снова CONFIRMED: слот занят, клиент не придёт, мастер ждёт. `cancelledAtUtc`/`cancelledBy` при этом **остаются заполненными** (confirm их не чистит) — строка внутренне противоречива, и любая аналитика по `cancelledAtUtc` посчитает её и отменённой, и подтверждённой. Симметрично: reschedule поверх отмены даёт `CHANGE_REQUESTED` на мёртвой брони.

**Направление фикса.** Оптимистическая блокировка на всех пяти путях: `updateMany({ where: { id, status: { in: <ожидаемые> } }, … })` → `count === 0` ⇒ `409 CONFLICT` («Статус записи изменился, обновите страницу»). Для `confirmBooking` дополнительно перенести чтение брони **внутрь** Serializable-транзакции — тогда SSI начнёт видеть зависимость и закроет остаток окна. Один общий helper `applyBookingTransition(tx, { id, from: BookingStatus[], to, data })`, чтобы шестой путь не появился без guard'а.

**Трудоёмкость:** M

---

#### LOGIC-03 — Клиент полностью контролирует длительность брони при переносе; work-hours и availability на этом пути не проверяются

**Файлы:** `src/lib/validation/bookings.ts:61-78` · `src/lib/bookings/usecases.ts:190-229, 258-272` · `src/lib/bookings/confirmBooking.ts:190-198`

**Доказательство.** Схема валидирует только «конец позже начала»:

```ts
// src/lib/validation/bookings.ts:61-78
export const bookingRescheduleSchema = z
  .object({ startAtUtc: dateString, endAtUtc: dateString, slotLabel: …, silentMode: …, comment: … })
  .superRefine((value, ctx) => {
    …
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) { ctx.addIssue({ … }); }
  });
```

`rescheduleBooking` **не вызывает** `resolveBookingCore` — то есть ни длительность услуги, ни availability-слот, ни рабочие часы не пересчитываются. Проверяются ровно три вещи: окно 60 минут (`usecases.ts:194`), `assertBookingWindow` — и то только по `startAtUtc` (`usecases.ts:201`) — и пересечение с чужими бронями по переданному диапазону (`usecases.ts:221-228`). Дальше значения пишутся как есть:

```ts
// usecases.ts:261-263
status: "CHANGE_REQUESTED",
proposedStartAt: input.startAtUtc,
proposedEndAt: input.endAtUtc,
```

и `confirmBooking` применяет их дословно:

```ts
// confirmBooking.ts:190-198
...(appliesRequestedChange ? { startAtUtc, endAtUtc, slotLabel: startAtUtc.toISOString(), … } : {}),
```

Для сравнения, на create-пути такая подмена невозможна: `resolveBookingCore` требует **точного** совпадения предложенного диапазона с реальным слотом (`booking-core.ts:377-382`, `slotStart.getTime() === startAtUtc.getTime() && slotEnd.getTime() === endAtUtc.getTime()`). На reschedule-пути этой проверки нет.

**Импакт.**
- **Сжатие:** клиент отправляет `end = start + 5 мин` для 90-минутной услуги, пролезает в щель между чужими бронями, мастер видит в диалоге только время начала и подтверждает. Реальная услуга накрывает следующего клиента.
- **Раздувание:** `start = 08:00`, `end = 23:59` — после подтверждения день мастера закрыт целиком.
- В обоих случаях `BookingServiceItem.durationSnapshotMin` остаётся старым → окно в `Booking` и снапшот длительности расходятся (гэп G4); аналитика загрузки и `available-today` считают по разным числам.
- Рабочие часы/выходной на этом пути не проверяются вообще: перенос на воскресенье 03:00 проходит (guard `assertWithinMasterWorkHours` подключён только к studio-move, `bookings.service.ts:480`).

**Направление фикса.** Принимать от клиента **только `startAtUtc`**, а `endAtUtc` выводить из `resolveBookingCore`/`resolveDuration` на сервере (это уже сделано на create-пути — `booking-core.ts:324`). Плюс подключить к reschedule ту же тройку guard'ов, что и к studio-move: `resolveSalonLocalParts` + `assertWithinMasterWorkHours` + availability-check. Если менять контракт API нельзя сразу — минимально: server-side проверка `end - start === resolveDuration(service, master)` с `422 VALIDATION_ERROR`.

**Трудоёмкость:** M

---

#### LOGIC-04 — Мастер/студия отменяет ОДИН компонент пакета в обход guard'а «пакет отменяется целиком» (инв. #34)

**Файлы:** `src/lib/studio/bookings.service.ts:697-723` · `src/lib/bookings/cancelBooking.ts:44-51` · `src/app/api/master/bookings/[id]/status/route.ts:35-40`

**Доказательство.** Клиентский путь guard имеет:

```ts
// cancelBooking.ts:44-51
if (booking.bookingPackageId) {
  throw new AppError("Этот пакет отменяется целиком.", 409, "PACKAGE_CANCEL_WHOLE",
    { bookingPackageId: booking.bookingPackageId });
}
```

Мастерский путь — параллельная реализация, которая до `cancelBooking` не доходит вовсе:

```ts
// studio/bookings.service.ts:705-720
const updated = await prisma.$transaction(async (tx) => {
  const updated = await tx.booking.update({
    where: { id: booking.id },
    data: { status: input.status, cancelledBy: "PROVIDER", cancelReason: comment || null, … },
```

Проверка отсутствия guard'а:
```
$ grep -c "bookingPackageId" src/lib/studio/bookings.service.ts
0
$ grep -rn "bookingPackageId" src/lib/studio/ src/app/api/master/bookings/
(пусто)
```
Роут `PATCH /api/master/bookings/[id]/status` принимает `CANCELLED`/`REJECTED`/`NO_SHOW` (`src/lib/master/schemas.ts:9`) и передаёт их напрямую.

**Импакт.** Пакет остаётся `BookingPackageStatus.ACTIVE` с одним `REJECTED` ребёнком. Инвариант #34 «Σ child `priceSnapshot` == `totalKopeks`» ломается: клиент оплачивает пакетную скидку за услуги, часть которых отменена. Финансовая отчётность по пакетам расходится, автоматической починки нет.

**Направление фикса.** В `updateMasterBookingStatus` перед записью статуса: если `booking.bookingPackageId` и действие — отмена/отклонение/неявка, либо делегировать в `cancelSoloPackageBooking` (отменить пакет целиком от лица PROVIDER), либо вернуть `409 PACKAGE_CANCEL_WHOLE`, как это делает клиентский путь. Продуктовое решение — за владельцем; технически обязательно, чтобы решение было **одно** для обеих сторон.

**Трудоёмкость:** S

---

#### LOGIC-05 — «Не пришёл» можно проставить только ДО начала приёма, и нельзя — после

**Файл:** `src/lib/studio/bookings.service.ts:662-703`

**Доказательство.**

```ts
// studio/bookings.service.ts:662-679
const runtimeStatus = resolveBookingRuntimeStatus({ status: booking.status, startAtUtc: …, endAtUtc: … });

if (input.status === "CONFIRMED") { … }

if (runtimeStatus === "REJECTED") { throw new AppError("Booking is in terminal state", 409, "VALIDATION_ERROR"); }

if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
  throw new AppError("Booking already started", 409, "CONFLICT");
}
```

`resolveBookingRuntimeStatus` (`flow.ts:56-58`) возвращает `IN_PROGRESS` при `now ≥ startAtUtc` и `FINISHED` при `now ≥ start + duration + 60 мин`. Значит после наступления времени приёма **любой** статус, включая `NO_SHOW`, отбивается 409. А до начала приёма `NO_SHOW` проходит: он не попадает ни в `isRejectAction`, ни в `isCancelAction` (`:681-682`), поэтому минует и `ensureBookingActionWindow`, и требование комментария (`:697-703`).

UI при этом кнопку показывает: `UI_TEXT` содержит `NO_SHOW: "Не пришёл"` (`src/lib/ui/text.ts:6774`), `booking-row-actions.tsx:26` держит `"NO_SHOW"` в списке действий, а уведомление `notifyBookingNoShow` вызывается из роута (`api/master/bookings/[id]/status/route.ts:46-47`).

**Импакт.** Мастер физически не может отметить неявку — единственный момент, когда действие имеет смысл (клиент не пришёл), совпадает с моментом, когда сервер отвечает 409 «Booking already started». Метрика неявок в аналитике всегда нулевая; политика поздних отмен опирается на статус, который не проставляется.

**Направление фикса.** Вынести `NO_SHOW` из общего гейта: разрешить `IN_PROGRESS`/`FINISHED` для него (и только для него), запретить до `startAtUtc`. Плюс перестать проставлять `cancelledBy: "PROVIDER"` / `cancelReason` для `NO_SHOW` — сейчас это делается безусловно (`:710-712`), из-за чего неявка неотличима от отмены мастером в отчётах.

**Трудоёмкость:** S

---

#### LOGIC-06 — Пятый (форкнутый) путь создания брони: подтверждение модель-оффера не проверяет TimeBlock

**Файл:** `src/app/api/model-applications/[applicationId]/confirm/route.ts:245-297, 362`

**Доказательство.** Роут не использует `ensureNoConflicts`, а копирует его тело:

```ts
// api/model-applications/[applicationId]/confirm/route.ts:252-275
const conflictWhere = application.offer.masterId
  ? { providerId: offerService.providerId, masterProviderId: application.offer.masterId }
  : { providerId: offerService.providerId };

const conflicts = await tx.booking.findMany({ where: { ...conflictWhere, status: { notIn: [...] }, … }, take: 1 });
…
if (conflict) { throw new AppError("Time slot is not available", 409, "SLOT_CONFLICT"); }
```

Проверка отсутствия TimeBlock-guard'а:
```
$ grep -n "assertNoTimeBlockConflict" "src/app/api/model-applications/[applicationId]/confirm/route.ts"
(пусто)
```
Изоляция при этом корректная — `Serializable` на строке 362. Но `FIX-TIMEBLOCK-ENFORCEMENT-01` объявляет `assertNoTimeBlockConflict` «ONE primitive reused at every create/move site» (`time-blocks.ts:22-25`), а этот сайт пропущен. И скоуп `conflictWhere` тот же дефектный, что в LOGIC-01.

**Импакт.** Подтверждение модель-оффера сажает бронь внутрь объявленного отсутствия мастера (BREAK/BLOCK). Мастер видит блок в календаре и одновременно бронь поверх него.

**Направление фикса.** Заменить форк на `ensureNoConflicts(tx, {...})` — он уже включает и booking-overlap, и `assertNoTimeBlockConflict` (`booking-core.ts:153-157`). Это же чинит здесь LOGIC-01.

**Трудоёмкость:** S

---

#### LOGIC-07 — Cron продления биллинга: нет лока на пересекающиеся прогоны и нет изоляции ошибок по подписке — один сбойный элемент убивает весь батч

**Файл:** `src/app/api/billing/renew/run/route.ts:49, 151-167, 284-289, 347-367, 369, 536, 547`

**Доказательство.**

Лока нет:
```
$ grep -rn "acquireLock|SETNX|setnx|withLock|advisory" src/app/api/billing/ src/lib/billing/
(0 совпадений)
```
Единственная защита роута — статический bearer-токен `BILLING_RENEW_SECRET` (`:50-55`), который аутентифицирует вызывающего, но не мешает двум одновременным вызовам.

Выборка кандидатов — обычный read, не claim:
```ts
// renew/run/route.ts:151-167
const candidates = await prisma.userSubscription.findMany({
  where: { status: "ACTIVE", autoRenew: true, cancelAtPeriodEnd: false, nextBillingAt: { lte: now } },
```
(нет `FOR UPDATE`, нет пометки «взято в работу»).

Идемпотентность на уровне БД есть, но обрабатывается неполно:
```ts
// renew/run/route.ts:284-289
const idempotenceKey = sha256(`renew:${subscription.id}:${formatDateKeyUtc(now)}`);
const existing = await prisma.billingPayment.findUnique({ where: { idempotenceKey }, … });
if (existing) { … continue; }
…
// renew/run/route.ts:347-367 — БЕЗ try/catch
const payment = await prisma.billingPayment.create({ data: { …, idempotenceKey, … } });
```

Структура try/catch в файле:
```
$ grep -n "^export async function POST|^    try|^  try|^  } catch" src/app/api/billing/renew/run/route.ts
49:export async function POST(req: Request)
369:    try            ← внутри цикла, только вокруг вызова YooKassa
536:  try             ← после цикла (trial-cron)
547:  try             ← после цикла (price-optin-cron)
```

**Импакт.**
- **Двойного списания нет** — `BillingPayment.idempotenceKey @unique` (`billing.prisma:158`) не даст второму `create()` пройти, и до `createRecurringPayment` проигравший не доходит. Это подтверждено.
- **Но** тело цикла (строки 168-368) не имеет try/catch, а `POST` не имеет внешнего. Любое исключение — P2002 от гонки, недоступность БД на одной подписке, падение внутри `prisma.userSubscription.update` — выбрасывается из цикла и завершает **весь** прогон. Оставшиеся кандидаты в этот день не продлеваются, и фазы после цикла (`trial-cron` на 536, `price-optin-cron` на 547) не запускаются вовсе. Это тихая деградация: cron вернул 500, а какие подписки успели — неизвестно.
- Фаза 1 (expire overdue, `:62-108`) при пересечении прогонов пишет **дублирующие** `billingAuditLog` и дублирующие уведомления `BILLING_SUBSCRIPTION_EXPIRED`: `updateMany` идемпотентен по статусу, а `createMany` аудита и цикл уведомлений (`:82-107`) — нет.

**Направление фикса.** (1) Redis-лок `billing:renew:run` с TTL > ожидаемого времени прогона, fail-fast 409 при занятости. (2) `try/catch` **вокруг тела цикла**, per-subscription: залогировать, `continue`, и вернуть в ответе сводку `{ processed, failed }` — падение одной подписки не должно стоить остальным дня. (3) Отдельно перехватывать `P2002` на `create()` как «уже взято другим прогоном» → `continue`.

**Трудоёмкость:** S (лок + per-item catch), M вместе со сводкой в ответе

---

#### LOGIC-21 — Клик по пустой ячейке в расписании мастера строит UTC-инстант в таймзоне БРАУЗЕРА, а не салона → бронь сохраняется не на то время

**Файлы:** `src/features/master/components/schedule/empty-cells-overlay.tsx:11-19, 56-60` · `src/features/master/components/schedule/week-grid-column.tsx:15, 29, 83-89, 118` · `src/features/master/components/dashboard/manual-booking-modal.tsx:80-90, 112` · `src/lib/master/schedule.service.ts:340`

**Доказательство.** Сетка расписания позиционирует всё по **salon-local** минутам:
```ts
// src/lib/master/schedule.service.ts:340
startMinuteOfDay: minuteOfDay(row.startAtUtc, master.timezone),
```

`WeekGridColumn` получает `timezone` пропом и использует его для карточек броней, но **в overlay не передаёт**:
```ts
// week-grid-column.tsx:29
export function WeekGridColumn({ day, hourStart, hourEnd, hourPx, timezone }: Props) {
…
// week-grid-column.tsx:83-89 — timezone отсутствует в списке пропов
<EmptyCellsOverlay
  iso={day.iso}
  hourStart={hourStart}
  hourEnd={hourEnd}
  hourPx={hourPx}
  workingIntervals={day.workingIntervals}
  occupied={occupied}
/>
…
// week-grid-column.tsx:118 — а сюда передаёт
  timezone={timezone}
```

В типе `Props` overlay'я поля `timezone` нет вовсе (`empty-cells-overlay.tsx:11-19`), и обработчик клика конструирует дату **локальным конструктором хоста**:
```ts
// empty-cells-overlay.tsx:56-60
const handleClick = (startMin: number) => {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return;
  const startsAt = new Date(y, m - 1, d, Math.floor(startMin / 60), startMin % 60, 0, 0);
  openManualBooking({ prefillTime: startsAt.toISOString() });
};
```
`startMin` — salon-local минуты (то, что мастер видит на сетке), а семиаргументный `new Date(...)` трактует их как wall-clock **браузера**.

Модаль декодирует обратно теми же host-локальными геттерами и снова кодирует host-локально:
```ts
// manual-booking-modal.tsx:82-90
const parsed = new Date(prefillTime);
…
const hh = String(parsed.getHours()).padStart(2, "0");
const mm = String(parsed.getMinutes()).padStart(2, "0");
setStartAt(`${y}-${m}-${d}T${hh}:${mm}`);
…
// manual-booking-modal.tsx:112
const startAtIso = new Date(startAt).toISOString();
```

Весь round-trip самосогласован **в таймзоне браузера** и ни в одной точке — в таймзоне салона. Именно поэтому в модали мастер видит те же «13:00», которые кликнул, — дефект визуально замаскирован.

**Импакт.** Для Vision (`Asia/Yekaterinburg`, +5), администратор/владелец которого работает из Москвы (+3): клик по ячейке «13:00» создаёт бронь с `startAtUtc`, соответствующим 15:00 по салону. Ошибка в 2 часа, без предупреждения. `POST /api/master/bookings` принимает `startAt` как есть. Обнаруживается только тем, что бронь появляется на сетке (которая рендерится корректно, в salon-tz) не там, куда кликнули.

Готовый образец фикса уже есть в кодбазе — студийная сторона использует `src/features/studio-cabinet/schedule/lib/datetime-input.ts` (`utcIsoToSalonInput` / `salonInputToUtcIso`). Мастерский quick-create его не использует вообще.

`npm run check:tz` ловит только шаг декодирования (`manual-booking-modal.tsx:87-88`); корневая причина (`empty-cells-overlay.tsx:59`) вне покрытия его регулярки — многоаргументный `new Date(...)` она не матчит.

**Направление фикса.** Протянуть `timezone` из `WeekGridColumn` в `EmptyCellsOverlay` и в `ManualBookingModal`, заменить обе конверсии на `salonInputToUtcIso`/`utcIsoToSalonInput`. Тест — прогон с `TZ=Europe/Moscow` против салона `Asia/Yekaterinburg`, который до фикса обязан падать.

**Трудоёмкость:** S

---

#### LOGIC-22 — Сессия истекла в открытой вкладке: студийная бронь молча уходит по гостевому пути и падает с `CONSENT_REQUIRED`, а со второй попытки проходит

**Файлы:** `src/proxy.ts:189-215, 270-279` · `src/lib/auth/session.ts:83-87` · `src/app/api/bookings/route.ts:63-119` · `src/features/public-studio/studio-booking-flow/booking-flow.tsx:488` · `src/features/public-studio/studio-booking-flow/components/booking-error.tsx:43-57` · `src/lib/http/fetch-with-auth.ts:28-41`

**Доказательство.** Middleware при протухшем access-токене действительно обновляет сессию server-to-server:
```ts
// src/proxy.ts:197-212
const accessValid = isAccessTokenValid(accessToken);
if (!accessValid) {
  const refreshToken = request.cookies.get("bh_refresh")?.value;
  if (refreshToken) {
    const refreshRes = await fetch(refreshUrl.toString(), { method: "POST", headers: { cookie: request.headers.get("cookie") ?? "" } });
    if (refreshRes.ok) { refreshedSetCookies = readSetCookieHeaders(refreshRes.headers); }
  }
}
```
Но свежие куки попадают **только в ответ**, а `requestHeaders`, которые уезжают в обработчик роута, не переписываются:
```ts
// src/proxy.ts:270-279
const response = NextResponse.next({
  request: { headers: requestHeaders },      // ← со СТАРОЙ cookie
});
…
for (const setCookie of refreshedSetCookies) {
  response.headers.append("set-cookie", setCookie);   // ← новая cookie только браузеру
}
```
`getSessionUserFromRequest` (`session.ts:83-87`) читает cookie с входящего `Request` — то есть протухшую.

Дальше `/api/bookings` тихо переключается на гостевой путь:
```ts
// src/app/api/bookings/route.ts:63-68
const sessionUser = await getSessionUserFromRequest(req);
if (sessionUser) { … userId = sessionUser.id; }
…
// src/app/api/bookings/route.ts:101-103
let effectiveClientUserId: string | null = sessionUser?.id ?? null;
if (!sessionUser) {
  assertRequiredConsents(consent);
```
А клиент consent не прислал, потому что его локальный `isGuest` остался `false` (`me` подгружался один раз при загрузке страницы и не перепроверяется):
```ts
// src/features/public-studio/studio-booking-flow/booking-flow.tsx:488
consent: isGuest ? consent : undefined,
```
→ `assertRequiredConsents(undefined)` → **400 `CONSENT_REQUIRED`**. Кода `CONSENT_REQUIRED` нет в `resolveMessage` (`booking-error.tsx:43-57`), поэтому пользователь видит generic-текст. Следующий запрос уже пройдёт — браузер получил свежую cookie вместе с ответом на упавший POST.

**Дополнительно:** глобальный 401-перехватчик в проекте есть — `fetchWithAuth` (`http/fetch-with-auth.ts:28-41`: refresh → один ретрай → иначе `window.location.href = /login?next=…`). Он импортируется в 14 файлах, но **ни в одной из пяти самых ответственных форм**: `booking-flow-stepper.tsx`, `studio-booking-flow/booking-flow.tsx`, `package-booking-flow.tsx`, `studio-package-flow.tsx`, `billing-page.tsx`, `review-form.tsx` — все используют голый `fetch`. У SWR глобального `onError` тоже нет (`components/providers/swr-provider.tsx:11-16`). То есть на 401 все шесть форм показывают обычный красный текст ошибки, без редиректа на логин и без сохранения обратного пути.

**Импакт.** Классический сценарий «вкладка провисела дольше двух часов» (TTL access-токена) на самом ответственном шаге воронки заканчивается непонятной ошибкой, которая исчезает сама при повторном нажатии. Пользователь не понимает, что произошло; часть уйдёт. Плюс: при истёкшей сессии клиент, который в системе **зарегистрирован**, создаёт бронь как гость на phone-keyed профиль — то есть та же бронь может не оказаться в его кабинете до следующей склейки по телефону.

**Направление фикса.** (1) Перевести шесть форм на `fetchWithAuth` — он уже делает ровно то, что нужно (refresh → ретрай → `/login?next=`). (2) Не полагаться на middleware-refresh для текущего запроса: либо переписывать `requestHeaders` обновлённой cookie в `proxy.ts:270`, либо (проще и честнее) на 401 отдавать клиенту `AUTH_REQUIRED`, чтобы он сам перезапросил и повторил. (3) Добавить `CONSENT_REQUIRED` и `AUTH_REQUIRED` в `booking-error.tsx:43-57` — клиент уже вычисляет `AUTH_REQUIRED` (`studio-booking.ts:202-204`) и выбрасывает этот сигнал в generic-ветку.

**Трудоёмкость:** M

---

### P2 🟡

---

#### LOGIC-08 — Двойной клик по «Оплатить» в пределах одного UTC-часа даёт необработанный 500 вместо `{ reused: true }`

**Файл:** `src/app/api/billing/checkout/route.ts:195-237, 248-278`

**Доказательство.** Два последовательных guard'а (30-минутный `recentPending` на `:180-193` и `findUnique` по `idempotenceKey` на `:199-215`) закрывают обычный последовательный дубль. Но при истинно одновременных запросах оба читают пустоту и оба доходят до:

```ts
// checkout/route.ts:217-237
const payment = await prisma.billingPayment.create({
  data: { subscriptionId, type: …, status: "PENDING", amountKopeks: priceKopeks, …, idempotenceKey, … },
  select: { id: true },
});
```

Вызов не обёрнут в try/catch — единственный `try` в файле начинается на `:248`, вокруг `createInitialPayment`. Проигравший получает `P2002` от `idempotenceKey @unique` (`billing.prisma:158`) и вываливается наружу необработанным.

**Импакт.** Двух платежей в ЮКассе **не создаётся** (constraint срабатывает до вызова API — это хорошо). Но пользователь на этапе оплаты видит сырой 500 вместо задуманного `{ reused: true }` с той же ссылкой на оплату. На платёжном экране это худшее место для необъяснимой ошибки: часть пользователей уйдёт, часть попробует ещё раз и попадёт в `PAYMENT_ALREADY_EXISTS` (409).

**Направление фикса.** Обернуть `create()` в try/catch, на `P2002` перечитать строку по `idempotenceKey` и вернуть ту же ветку ответа, что и `existingByKey` на `:206-215`. Тот же паттерн уже применён правильно в `mrr-snapshot.ts:135-150` — скопировать оттуда.

**Трудоёмкость:** S

---

#### LOGIC-09 — Пакетные booking-роуты не принимают `x-idempotency-key`; двойной сабмит отвечает «Это время уже занято»

**Файлы:** `src/app/api/public/packages/[id]/book/route.ts:26-42, 100-108` · `src/app/api/public/packages/[id]/studio/book/route.ts` · `src/lib/bookings/package-booking.ts:412-421` · `src/app/api/bookings/route.ts:120-122`

**Доказательство.** Единственный отправитель ключа во всём фронтенде:
```
$ grep -rn "x-idempotency-key" src/
src/app/api/bookings/route.ts:120          ← читает (опционально)
src/app/api/public/bookings/route.ts:47    ← читает (обязателен, 400 без него)
src/features/booking/components/booking-flow/booking-flow-stepper.tsx:338  ← ЕДИНСТВЕННЫЙ отправитель
src/proxy.ts:16                            ← CORS-заголовок
```
`packageBookSchema` (`packages/[id]/book/route.ts:26-42`) поля идемпотентности не содержит, заголовок не читается, `createSoloPackageBooking` (`package-booking.ts:412-421`) параметра `idempotencyKey` не имеет вовсе — в отличие от `createBooking` (`createBooking.ts:59`).

**Импакт.** Дубля пакета не возникает — второй запрос упирается в `ensureNoConflicts` уже созданных сиблингов. Но ответом будет `409 BOOKING_CONFLICT` с текстом «Это время уже занято. Пожалуйста, выберите другое окошко.» (`package-booking.ts:50`). Пользователь, чей пакет **успешно создан**, видит сообщение, что время занято, и уходит выбирать другое. Инвариант #28 («Booking state-change endpoints идемпотентны») на этих роутах не выполняется.

Смежно: `POST /api/bookings` читает заголовок, но не требует его (`route.ts:120-122`, `normalizedIdempotencyKey` может быть `null`), тогда как `/api/public/bookings` требует (400 без него). Асимметрия контракта.

**Направление фикса.** Протянуть `idempotencyKey` в `createSoloPackageBooking`/`createStudioPackageBooking` (namespace по `clientUserId ?? guest:phone` + `packageId`) и требовать заголовок на обоих `/book`-роутах, как это уже сделано в `/api/public/bookings:47-51`. Кэшировать результат нужно по `bookingPackageId`, а не по одной брони.

**Трудоёмкость:** M

---

#### LOGIC-10 — Двойной клик по «Записаться»: успешная бронь показывается как конфликт слота

**Файлы:** `src/lib/bookings/idempotency.ts:63-76, 100-103` · `src/lib/bookings/createBooking.ts:75-77` · `src/features/booking/components/booking-flow/booking-flow-stepper.tsx:359-365`

**Доказательство.** Ожидание чужого результата ограничено ~300 мс:

```ts
// idempotency.ts:63-76
async function waitForIdempotencyResult(key: string, userId: string | null): Promise<BookingDto | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getIdempotencyRecord(key);
    if (current?.status === "done") { … }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}
```

Если первый запрос ещё в Serializable-транзакции (логируемое `transactionMs`, `createBooking.ts:273`, вполне может превысить 300 мс под нагрузкой), второй получает `null` и падает в:

```ts
// createBooking.ts:75-77
if (!idempotency.lockAcquired) {
  throw new AppError("Повторный запрос.", 409, "DUPLICATE_REQUEST");
}
```

Клиент трактует **любой** 409 как конфликт слота и ротирует ключ:

```ts
// booking-flow-stepper.tsx:359-365
if (res.status === 409) {
  dispatch({ type: "submitConflict" });
  // Rotate idempotency key so the retry isn't treated as a duplicate.
  idempotencyKeyRef.current = typeof crypto !== "undefined" ? crypto.randomUUID() : `bk-${Date.now()}`;
  return;
}
```

**Импакт.** Пользователь, чья бронь создана, видит экран «время занято». Повторная попытка идёт уже с новым ключом → упирается в **собственную** только что созданную бронь → снова 409, теперь настоящий `SLOT_CONFLICT`. Классический «двойной клик» на самом критичном шаге воронки заканчивается сообщением, которое прямо противоречит реальности.

**Направление фикса.** Разделить коды на клиенте: `DUPLICATE_REQUEST` → не ротировать ключ, дождаться/перезапросить бронь (например, повторить тот же POST с тем же ключом ещё раз — сервер вернёт закэшированный результат), показать успех. `SLOT_CONFLICT`/`BOOKING_CONFLICT` → текущее поведение. На сервере — увеличить бюджет ожидания в `waitForIdempotencyResult` до порядка длительности транзакции (напр. 10 попыток × 200 мс) и возвращать `202`/`retry-after` вместо 409, если результат так и не появился.

**Трудоёмкость:** S

---

#### LOGIC-11 — `ScheduleOverride` без unique-констрейнта + check-then-insert → дубликаты, и guard рабочих часов выбирает из них произвольный

**Файлы:** `prisma/schema/schedule.prisma:90-126` · `src/lib/schedule/editor.ts:172-213` · `src/lib/studio/bookings.service.ts:74-84` · `src/lib/schedule/engine-context.ts:56, 277-282`

**Доказательство.** В схеме — только индексы:
```prisma
// prisma/schema/schedule.prisma:124-126
  @@index([providerId])
  @@index([providerId, date])
}
```

Запись — классический check-then-insert без транзакции:
```ts
// src/lib/schedule/editor.ts:174-213
const existing = await prisma.scheduleOverride.findFirst({ where: { providerId, date }, select: { id: true } });
…
if (existing) { await prisma.scheduleOverride.update({ … }); }
else          { await prisma.scheduleOverride.create({ data: { providerId, date, … } }); }
```

При дубликатах два потребителя расходятся. Guard рабочих часов берёт **произвольную** строку (`findFirst` без `orderBy`):
```ts
// src/lib/studio/bookings.service.ts:76-79
prisma.scheduleOverride.findFirst({
  where: { providerId: masterProviderId, date: overrideDate },
  include: { template: { select: { startLocal: true, endLocal: true } } },
}),
```
а движок расписания держит **список** и обрабатывает его целиком (`engine-context.ts:56` — `Map<string, OverrideRow[]>`, `engine.ts:25-32`).

**Импакт.** Автосейв настроек расписания (debounce 500 мс) при быстрых правках даёт два параллельных `applyScheduleSnapshot`; оба видят `existing = null` и создают по строке. Дальше `assertWithinMasterWorkHours` может разрешить перенос, который генератор слотов не предлагал (или наоборот) — недетерминированно, в зависимости от того, какую строку вернул планировщик Postgres.

**Направление фикса.** Миграцией добавить `@@unique([providerId, date])` (перед этим — дедуп-скрипт по существующим данным) и заменить check-then-insert на `upsert`. Пока констрейнта нет — как минимум `orderBy: { updatedAt: "desc" }` в `findFirst` на `bookings.service.ts:76`, чтобы guard и движок сходились на одной строке.

**Трудоёмкость:** M

---

#### LOGIC-12 — `applyScheduleSnapshot` не атомарен: `deleteMany` + `createMany` вне транзакции может стереть неделю мастера

**Файл:** `src/lib/schedule/editor.ts:156-159, 528-569`

**Доказательство.**

```ts
// src/lib/schedule/editor.ts:156-159
await prisma.weeklyScheduleDay.deleteMany({ where: { configId: config.id } });
if (rows.length > 0) {
  await prisma.weeklyScheduleDay.createMany({ data: rows });
}
```

Вызывающая функция тоже не транзакционна — четыре независимых шага подряд:
```ts
// src/lib/schedule/editor.ts:546-568
await applyProviderAndDiscountRule(providerId, input);   // своя $transaction
await saveWeekSchedule(providerId, weekSchedule);        // БЕЗ транзакции
…
for (const item of normalizedExceptions) { await saveException(providerId, item); }   // БЕЗ транзакции
for (const key of existingDateKeys) { if (!nextDateKeys.has(key)) await removeExceptionByDate(providerId, key); }
await invalidateSlotsForMaster(providerId);
```

Контраст внутри того же файла: `applyProviderAndDiscountRule` **обёрнута** в `$transaction` (`:484`) с комментарием «*so a half-applied state is impossible*» (`:439-440`). Для расписания — самой чувствительной части — этого не сделано.

**Импакт.** Обрыв (таймаут пула, рестарт пода, сетевой сбой) между строками 156 и 158 оставляет мастера с **нулём** `WeeklyScheduleDay`. Дальше `buildWeeklyRule` при отсутствии рабочих дней возвращает `null` (`engine-context.ts:104-105`), то есть мастер исчезает из выдачи слотов и перестаёт принимать записи — без единой ошибки в UI, потому что PATCH уже вернул ошибку и пользователь думает, что «просто не сохранилось».

Смежно: `deleteMany` + `createMany` конкурентно с другим таким же вызовом (тот же автосейв) даёт `P2002` на `@@unique([configId, weekday])` (`schedule.prisma:34`) → 500 пользователю.

**Направление фикса.** Обернуть `saveWeekSchedule` + все `saveException`/`removeExceptionByDate` в один `prisma.$transaction` внутри `applyScheduleSnapshot` (переведя их на `tx`-клиент). Инвалидацию кэша — после коммита, как сейчас.

**Трудоёмкость:** M

---

#### LOGIC-13 — Отметка дня выходным: отмены броней и запись расписания не атомарны, а пакетная бронь роняет цикл на середине

**Файл:** `src/app/api/cabinet/master/schedule/route.ts:225-248, 603-611, 648`

**Доказательство.** Порядок действий в PATCH:
```
603:        const conflicts = await listDayOffConflicts({ … });
610:          assertConflictResolution({ conflicts, resolution });
611:          await cancelConflictingBookings({ conflicts, req });    ← отмены
648:    await applyScheduleSnapshot(actor.providerId, { … });          ← запись выходного
```

Отмены идут в простом цикле без транзакции и без компенсации:
```ts
// route.ts:229-234
for (const booking of input.conflicts) {
  await cancelBooking({ bookingId: booking.id, cancelledBy: "PROVIDER", reason: "День отмечен выходным в расписании мастера" });
```

При этом `cancelBooking` бросает на пакетном ребёнке (`cancelBooking.ts:44-51`), а `listDayOffConflicts` (`route.ts:134-149`) по `bookingPackageId` не фильтрует и в `canCancel` его не учитывает (`isCancellableStatus` смотрит только на статус).

**Импакт.**
- День с пакетной бронью: часть броней уже отменена, потом цикл падает 409 `PACKAGE_CANCEL_WHOLE`, выходной не проставлен. Пользователь видит ошибку, а клиентам уже ушли уведомления об отмене. Отката нет.
- Любой сбой в `applyScheduleSnapshot` (см. LOGIC-12) после строки 611 даёт то же: брони отменены, день остался рабочим.

**Что здесь сделано хорошо** (отмечаю как образец, который стоит распространить): `assertConflictResolution` (`:207-222`) требует **точного** совпадения множества id, которое клиент подтвердил, с множеством, которое сервер видит сейчас, и иначе отвечает «Список записей для отмены устарел. Обновите день и повторите действие.» Это ровно тот guard от протухшей вкладки, которого не хватает переходам статуса (LOGIC-02).

**Направление фикса.** (1) `listDayOffConflicts` должен помечать пакетных детей как `canCancel: false` (или разворачивать пакет целиком и показывать это в диалоге) — тогда `assertConflictResolution` отдаст внятный 409 **до** первой отмены. (2) Отмены и запись выходного — в одну транзакцию; уведомления — после коммита.

**Трудоёмкость:** M

---

#### LOGIC-14 — `/api/billing/checkout` не в списке sensitive-роутов → при недоступности Redis не fail-closed

**Файлы:** `src/lib/rate-limit/index.ts:22-34, 150-176` · `src/proxy.ts:111-137` · `src/lib/rate-limit/configs.ts:23`

**Доказательство.** `SENSITIVE_ROUTE_PREFIXES` (`rate-limit/index.ts:22-34`) содержит `/api/auth`, `/api/bookings`, `/api/payments`, `/api/me/delete`, `/api/cabinet/master/delete`, `/api/cabinet/studio/delete`, `/api/categories/propose`, `/api/master/portfolio`, `/api/studio`, `/api/studios`, `/api/reviews` — **`/api/billing` отсутствует**. `resolveRateLimitTier` (`proxy.ts:111-137`) для `/api/billing/checkout` не матчит ни один частный случай и проваливается в `return "publicApi"` (`:136`) = 120 req/60s (`configs.ts:23`).

**Импакт.** Инициация платежа — мутирующий и денежный эндпоинт. При недоступности Redis он не fail-closed (инв. #6 к нему не применяется), а деградирует до per-process memory-fallback в проде и до полного fail-open в dev (`index.ts:175`). Webhook (`/api/payments`) при этом защищён — асимметрия внутри платёжного домена.

**Направление фикса.** Добавить `/api/billing` в `SENSITIVE_ROUTE_PREFIXES`. Проверить, что cron-роуты (`/api/billing/renew/run`, `/api/billing/mrr/snapshot/run`) от этого не пострадают — у них свой токен-гейт, но fail-closed 429 при outage Redis для них тоже корректное поведение.

**Трудоёмкость:** S

---

#### LOGIC-15 — `recoverStuckJobs` не атомарен: при ≥2 воркерах одна задача восстанавливается дважды

**Файл:** `src/lib/queue/queue.ts:420-446` · тест `src/lib/queue/queue.test.ts:173-192`

**Доказательство.**

```ts
// src/lib/queue/queue.ts:420-432
// Stale lease → dead worker → recover exactly once.
await runQueueRedisCommand("recoverStuckJobs:lRem", client.lRem(PROCESSING_KEY, 1, raw));   // результат НЕ проверяется
await runQueueRedisCommand("recoverStuckJobs:hDel", client.hDel(PROCESSING_HEARTBEAT_KEY, job.id));

const attempts = (job.attempts ?? 0) + 1;
if (attempts <= MAX_RECOVERY_ATTEMPTS) {
  const recoveredJob = normalizeJobMeta({ ...withoutProcessingTimestamp(job), attempts, _recoveredAt: now });
  await runQueueRedisCommand("recoverStuckJobs:lPush", client.lPush(QUEUE_KEY, JSON.stringify(recoveredJob)));  // безусловно
```

Комментарий обещает «recover exactly once», но количество реально удалённых `lRem` элементов отбрасывается, а `lPush` выполняется независимо от него. Два процесса, прочитавшие один и тот же stale-элемент в одном 2-минутном тике, оба доходят до `lPush`. Тест покрывает только последовательный сценарий (`recovered1`, затем `recovered2`), гонка не покрыта.

**Импакт.** Зависит от типа задачи. Безопасно переигрываются: `booking.reminder` (атомарный claim `updateMany … WHERE reminderXhSentAt IS NULL`, `reminders.ts:102-119`), `yookassa.webhook` (early-return по статусу, `webhook-processor.ts:180-186`), `mrr.snapshot.daily` (`@unique snapshotDate`), `media.purge`/`media.cleanup`, `visual_search_index`. **Не безопасны:** `telegram.send` (`telegram/client.ts:11-34` — голый fetch без ключа идемпотентности) и `notification.billing.plan-edited.mass` (`notifications/admin-initiated.ts:117-152` — каждый прогон заново выбирает **всех** активных подписчиков и рассылает без per-recipient claim).

Сейчас единственная защита — соглашение «воркер в одной реплике» (`docs/DEPLOYMENT-ARCHITECTURE.md:263-276`), которое кодом не enforce'ится.

**Направление фикса.** Проверять результат `lRem` (`if (removed === 0) continue;`) перед `lPush`/dead-letter — этого достаточно, чтобы гонку закрыть. Отдельно: `notification.*.mass` перевести на per-recipient claim (`setNx` по `(jobId, userId)` с TTL), как это уже сделано в `slot-freed.ts:75-77`.

**Трудоёмкость:** S (проверка `lRem`), M (claim для mass-нотификаций)

---

#### LOGIC-16 — Пересчёт рейтинга провайдера теряет обновления при конкурентных отзывах

**Файл:** `src/lib/reviews/service.ts:223-263, 453-484`

**Доказательство.** Агрегат считается внутри транзакции с **изоляцией по умолчанию** (Read Committed):
```ts
// reviews/service.ts:453 — транзакция без isolationLevel
created = await prisma.$transaction(async (tx) => {
  …
  const review = await tx.review.create({ … });
  await recalculateTargetRatings(tx, target.targetType, target.targetId);
```
```ts
// reviews/service.ts:223-245
const aggregate = await tx.review.aggregate({ where: { targetType, targetId, ...ACTIVE_REVIEW_FILTER }, _avg: { rating: true }, _count: { _all: true } });
…
await tx.provider.update({ where: { id: targetId }, data: { ratingAvg, ratingCount, rating: ratingAvg, reviews: ratingCount } });
```

Под Read Committed транзакция B не видит незакоммиченный `create` транзакции A, поэтому считает `count = N+1` вместо `N+2` и записывает это значение поверх результата A.

**Импакт.** `Provider.ratingCount`/`ratingAvg` (и дубликаты `reviews`/`rating`) занижены. Ошибка не самозалечивается — следующий отзыв пересчитает от актуального состояния и «догонит», но до него на публичном профиле висит неверное число. Порча косметическая, не денежная — отсюда P2.

**Направление фикса.** Либо `isolationLevel: Serializable` на этой транзакции с ретраем на P2034, либо (дешевле) вынести `recalculateTargetRatings` в очередь как идемпотентную задачу, которая всегда считает от коммитнутого состояния.

**Трудоёмкость:** S

---

#### LOGIC-23 — Автосейв-хуки не имеют in-flight guard'а: два PATCH'а могут лететь одновременно, последний ответ выигрывает

**Файлы:** `src/features/client-cabinet/profile/hooks/use-profile-autosave.ts:42, 66-76` · `src/features/master/components/schedule-settings/use-auto-save.ts:36, 54-56, 61, 73` · `src/features/master/components/profile/editable/use-autosave.ts:47, 84-90`

**Доказательство.**
- `use-profile-autosave.ts:66-76` (`scheduleSave`) сливает патч и перезапускает таймер, но не проверяет, летит ли уже `flush()`. При повторном срабатывании debounce до возврата первого ответа уходит второй `PATCH /api/cabinet/user/profile`.
- `use-auto-save.ts:36, 54-56` создаёт `AbortController` и абортит предыдущий (`inFlightRef.current?.abort()`), но `controller.signal` **не передаётся в `fetch`** — проверяется только `controller.signal.aborted` уже после резолва промиса (`:61`, `:73`). То есть отменяется применение устаревшего ответа к состоянию, но не сам запрос: первый PATCH всё равно доезжает до сервера.
- `use-autosave.ts:47, 84-90` — `inFlightRef` присваивается, но нигде не читается как гейт перед стартом нового `performSave`.

**Импакт.** Быстрые правки в настройках (в т.ч. в расписании — а это `applyScheduleSnapshot`, см. LOGIC-11/-12) отправляют перекрывающиеся PATCH'и. Для расписания это ровно тот сценарий, который порождает дубликаты `ScheduleOverride` и `P2002` на `@@unique([configId, weekday])`. Для профиля — тихая потеря части полей: два разных патча, последний ответ выигрывает.

**Направление фикса.** Один общий guard: если запрос в полёте — не стартовать новый, а поставить его в «после текущего» (queue-of-one). Плюс реально передавать `signal` в `fetch` там, где `AbortController` уже создаётся.

**Трудоёмкость:** S

---

#### LOGIC-24 — `PATCH /api/me` валидирует `displayName` и `address`, а потом молча их выбрасывает

**Файлы:** `src/app/api/me/route.ts:46-60` · `src/lib/users/schemas.ts:21-38`

**Доказательство.** Zod-схема эти поля описывает (`schemas.ts:22` — `displayName`, `:35` — `address`), а роут вырезает их дважды: из сырого тела **до** парсинга (`route.ts:46-52`) и из результата **после** (`route.ts:58-60`).

**Импакт.** Клиент отправляет `{ displayName: "Новое имя" }`, получает `200 OK` — и ничего не меняется. Ни ошибки, ни объяснения. Для внешнего интегратора (мобильное приложение — `MOBILE-API` в бэклоге) это худший из возможных контрактов: успешный ответ на проигнорированную операцию.

**Направление фикса.** Убрать поля из схемы (тогда Zod вернёт понятную ошибку «unrecognized key» либо просто отбросит их согласно `strip`-режиму) или вернуть `400 VALIDATION_ERROR` с явным сообщением, если они присланы. Текущая двойная зачистка — самый неинформативный из трёх вариантов.

**Трудоёмкость:** S

---

#### LOGIC-25 — Дедлайн opt-in-окна в уведомлении рендерится cron'ом без указания таймзоны

**Файлы:** `src/lib/billing/price-optin-cron.ts:9, 45-58` · `src/lib/format.ts:47-53`

**Доказательство.**
```ts
// src/lib/format.ts:47-53
export function dateRU(d: Date) {
  return new Intl.DateTimeFormat(LOCALE, { year: "numeric", month: "long", day: "2-digit" }).format(d);
}
```
`timeZone` не передаётся — значит, берётся ambient-tz процесса. Вызывается из **cron-задачи**, у которой браузерного контекста нет вообще:
```ts
// src/lib/billing/price-optin-cron.ts:45
const deadlineLabel = sub.graceUntil ? dateRU(sub.graceUntil) : "";
```
и подставляется в тело уведомления (`:46-58`, `UI_TEXT.billing.priceOptIn.reminderBody(priceLabel, deadlineLabel)`).

Это ровно тот класс, про который предупреждает doc-комментарий соседнего `format-booking-when.ts:17-28` («server-side messages with no browser viewer context» ⇒ метка зоны обязательна). Там правило соблюдено, здесь — нет.

**Импакт.** Дата дедлайна (день до которого нужно принять новую цену) зависит от tz процесса. Граница суток — реальный риск: провайдер видит «до 12 августа», а cron экспайрит по другому дню.

**Направление фикса.** `dateRU(d, timeZone)` с обязательным аргументом на серверных путях; для биллинговых дедлайнов уместнее всего tz провайдера. На клиентских поверхностях — явная пометка `// tz-ok: viewer`.

**Трудоёмкость:** S

---

#### LOGIC-26 — Дата по умолчанию в booking-визардах берётся из «сегодня» посетителя, а не студии

**Файлы:** `src/features/booking/lib/studio-booking.ts:77-82, 98-100` · `src/features/public-studio/studio-booking-flow/booking-flow.tsx:75, 267` · `src/features/public-studio/components/studio-package-flow.tsx:54-67`

**Доказательство.**
```ts
// src/features/booking/lib/studio-booking.ts:77-82
function toDateKey(date: Date) {
  const year = date.getFullYear();          // host-локальные геттеры
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function todayKey() { return toDateKey(new Date()); }
```
```ts
// booking-flow.tsx:75
const [selectedDate, setSelectedDate] = useState(todayKey());
// booking-flow.tsx:267
fetchMasterAvailability(master.id, serviceId, selectedDate)
```
`studio-package-flow.tsx:54-67` (`buildDays`) строит список дней тем же способом — `studioTimezone` в компоненте есть как проп, но в `buildDays` не используется.

**Импакт.** Клиент из Калининграда (+2), открывающий Vision (+5) поздно вечером, получает выдачу слотов на **вчерашний** по меркам салона день. Не порча данных — навигацией лечится, — но виджет открывается не на том дне, а часть слотов «сегодня» невидима.

**Направление фикса.** `todayKey(studioTimezone)` через `toLocalDateKey(new Date(), tz)` (`schedule/timezone.ts`) — helper уже есть и используется в движке.

**Трудоёмкость:** S

---

### P3 🔵

---

#### LOGIC-17 — `createStudioBooking` / `moveStudioBooking` читают ВСЕ брони мастера без временного фильтра внутри Serializable-транзакции

**Файл:** `src/lib/studio/bookings.service.ts:250-259, 514-524`

**Доказательство.**
```ts
// bookings.service.ts:250-259
const conflicts = await tx.booking.findMany({
  where: {
    providerId: studio.providerId,
    masterProviderId: master.id,
    status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
    startAtUtc: { not: null },
    endAtUtc: { not: null },
  },
  select: { startAtUtc: true, endAtUtc: true },
});
```
Ни `lt`/`gt` по окну, ни `take`. Для сравнения — `ensureNoConflicts` фильтрует диапазон и берёт `take: 1` (`booking-core.ts:120-129`).

**Импакт.** Помимо роста стоимости запроса (это проход 04), внутри Serializable это создаёт predicate-lock на **всю историю** броней мастера → любая параллельная запись брони этого мастера становится кандидатом на `P2034` и получает ложный 409 `SLOT_CONFLICT`. С ростом истории частота ложных конфликтов растёт линейно.

**Направление фикса.** Добавить фильтр по буферизованному окну (как в `ensureNoConflicts`) — это же снимает и перф-вопрос. Лучше — просто перейти на `ensureNoConflicts` (см. LOGIC-01/-06).

**Трудоёмкость:** S

---

#### LOGIC-18 — `slotPrecision` не влияет ни на один booking-эндпоинт: настройка обещает больше, чем делает

**Файлы:** `src/features/catalog/components/catalog-card.tsx:148` · `src/app/api/public/providers/[providerId]/slots/route.ts` · `src/lib/ui/text.ts:6372-6379`

**Доказательство.** Полный список потребителей:
```
$ grep -rn "slotPrecision" src/
src/features/catalog/lib/slot-precision-format.ts        ← форматтер
src/features/catalog/components/catalog-card.tsx:148     ← карточка каталога — ЕДИНСТВЕННЫЙ рендер
src/lib/catalog/catalog.service.ts:905,1026              ← отдача поля
src/features/master/…/slot-visibility-section.tsx        ← редактор настройки
src/features/studio-cabinet/…/visibility-tab.tsx         ← редактор настройки
src/lib/schedule/editor.ts:474                           ← запись настройки
```
`src/app/api/public/providers/[providerId]/slots/route.ts` поле не читает вообще (grep по файлу — 0 совпадений).

Хинт в кабинете при этом честен ровно наполовину: «Что видит клиент **в каталоге** — конкретное время / занятость дня / только даты» (`text.ts:6373-6374`), но соседний заголовок называется «Точность слотов», а сама секция озаглавлена «Как клиенты видят окошки» (`slot-visibility-section.tsx:33-35`) — что читается как «везде».

**Импакт.** Мастер, выбравший «Только дата» ради приватности своей загрузки, всё равно отдаёт точное расписание в публичном виджете бронирования. Это не баг конкретного роута — это несоответствие обещания настройки её области действия.

**Направление фикса.** Продуктовое решение: либо распространить `slotPrecision` на публичный виджет и профиль, либо переименовать настройку и хинт так, чтобы область «только каталог» была очевидна из названия, а не из подписи.

**Трудоёмкость:** S (переименование) / L (реальное расширение)

---

#### LOGIC-19 — `TimeBlock.masterId` без внешнего ключа

**Файл:** `prisma/schema/schedule.prisma:182-197`

**Доказательство.**
```prisma
model TimeBlock {
  id String @id @default(cuid())
  studioId String?
  studio Studio? @relation(fields: [studioId], references: [id], onDelete: Cascade)
  masterId String              // ← голая строка, @relation нет
  startAt DateTime
  endAt DateTime
```

**Импакт.** Удаление/анонимизация провайдера (`provider-data-disposition.ts`) не может каскадом убрать блоки — БД про эту связь не знает, а DMMF-guard инварианта #38 её не увидит, потому что это не relation. Блоки-«сироты» остаются в `loadTimeBlockRanges` (`time-blocks.ts:59-67`, запрос по `masterId`) навсегда.

**Направление фикса.** Миграцией завести `masterProvider Provider @relation(fields: [masterId], …, onDelete: Cascade)` и внести `TimeBlock` в карту диспозиций провайдера.

**Трудоёмкость:** S

---

#### LOGIC-20 — Нет CHECK-констрейнтов на числовые бизнес-диапазоны

**Файлы:** `prisma/schema/booking.prisma:154-156` · `prisma/schema/review.prisma:28` · `prisma/schema/provider.prisma:41,55-64`

**Доказательство.** `priceSnapshot Int`, `durationSnapshotMin Int`, `rating Int`, `bufferBetweenBookingsMin Int @default(0)`, `minBookingHoursAhead Int @default(2)` — ни одного `@db.Check` / raw-SQL CHECK во всей схеме. Диапазоны держатся исключительно на Zod и ручных проверках (`booking-core.ts:308-315`, `reviews/service.ts:748`).

**Импакт.** Само по себе не эксплуатируется — все текущие пути валидируют. Но это означает, что защита существует ровно там, где кто-то её написал: новый путь записи, миграция данных или сид сохранят отрицательную длительность/цену без единого возражения БД. Тот же класс, что и G1: инвариант живёт только в приложении.

**Направление фикса.** Добавить CHECK'и одной миграцией (`priceSnapshot >= 0`, `durationSnapshotMin > 0`, `rating BETWEEN 1 AND 5`, `bufferBetweenBookingsMin BETWEEN 0 AND 30`) и внести их в `scripts/raw-sql-objects.mjs`, иначе `check:schema-drift` покраснеет.

**Трудоёмкость:** S

---

#### LOGIC-27 — Мёртвый билдер уведомления с захардкоженным `timeZone: "UTC"` без метки зоны

**Файл:** `src/lib/notifications/service.ts:541-564, 566, 591, 624-630`

**Доказательство.**
```ts
// src/lib/notifications/service.ts:541-546
const label = input.startAtUtc.toLocaleString("ru-RU", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "UTC",
});
```
`booking.provider.timezone` в этой же функции загружается (`:591`), но в `buildBody` не передаётся (`:624-630`). Получателями были бы **и клиент, и мастер** (`:609-618`).

Живой путь при этом корректен и лежит в другом файле — `src/lib/notifications/booking-notifications.ts:5-7` импортирует `formatBookingWhenLabel` (salon-tz + метка зоны). `grep -rn "createBookingNotifications" src/` даёт только определение (`service.ts:566`) и тест — **боевых вызовов ноль**.

**Импакт.** Сегодня — нулевой. Риск в том, что рядом с корректным путём лежит готовая к переиспользованию функция, реализующая ровно тот анти-паттерн, который проект специально вычищал (HARDENING-09 #13). Следующий, кто напишет уведомление «по образцу существующего», может взять этот образец.

**Направление фикса.** Удалить `buildBody` + `createBookingNotifications` либо привести к `formatBookingWhenLabel(date, provider.timezone)`.

**Трудоёмкость:** S

---

#### LOGIC-28 — Подписи точек на admin-графике рендерятся в ambient-tz процесса, хотя бакетирование строго UTC

**Файл:** `src/features/admin-cabinet/dashboard/server/charts.service.ts:24-28, 37` · `.../shared.ts:36-41, 114-116`

**Доказательство.**
```ts
// charts.service.ts:24-28
const labelFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" });
const dayLabel = new Intl.DateTimeFormat("ru-RU", { day: "2-digit" });
```
Ключи бакетов при этом строго UTC (`shared.ts:36-41` — `toISOString().slice(0,10)`, `setUTCDate`). Один и тот же `date` бакетируется по UTC, а подписывается по tz процесса.

**Импакт.** При RU-хостинге (положительное смещение) UTC-полночь подписывается тем же календарным днём — сегодня расхождения нет. Но выбор не объявлен и внутренне противоречив: смена площадки на отрицательное смещение сдвинет подписи на день относительно собственных бакетов, молча.

**Направление фикса.** `{ timeZone: "UTC", … }` — привести подпись к тому, по чему бакетируется.

**Трудоёмкость:** S

---

#### LOGIC-29 — `check:tz` не видит ES6-shorthand `{ timeZone }` и даёт ложные срабатывания на корректном коде

**Файл:** `scripts/check-tz.mjs` (`TZ_AWARE_RE`)

**Доказательство.** Регулярка требует двоеточие (`/timeZone\s*:/`), поэтому корректные вызовы с сокращённой записью попадают в список кандидатов. Проверено чтением каждого файла — пять ложных срабатываний:
`client-bookings-page.tsx:707,710,721` · `studio-cabinet/bookings/components/booking-row.tsx:52,55` · `client-cabinet/bookings/lib/group-by-month.ts:30,31` · `analytics/domain/helpers.ts:95,96` — все передают `timeZone` шорткатом и salon-tz соблюдают.

**Импакт.** Review-aid, у которого треть базовой линии — шум, перестают читать. Это ровно тот механизм, из-за которого в проекте уже «протухали» гейты (§9 контекста про `check:schema-drift`).

**Направление фикса.** Расширить до `/timeZone\b/`. Заодно — покрыть многоаргументный `new Date(y, m, d, hh, mm)` (именно из-за его отсутствия корневая причина LOGIC-21 не была видна инструменту).

**Трудоёмкость:** S

---

#### LOGIC-30 — Серверная проверка телефона слабее клиентской

**Файлы:** `src/lib/auth/otp.ts:4-9` · `src/app/api/public/bookings/route.ts:54` · `src/features/booking/components/booking-flow/booking-flow-stepper.tsx:309`

**Доказательство.** `normalizePhone` только вычищает `()`, пробелы и дефисы и добавляет `+`. Единственный серверный порог — длина:
```ts
// api/public/bookings/route.ts:54
if (!phoneNormalized || phoneNormalized.length < 8) {
```
Клиент при этом строже — требует 10 цифр (`booking-flow-stepper.tsx:309`, `submitPhone.replace(/\D/g, "").length < 10`).

**Импакт.** Прямой вызов API мимо виджета создаёт гостевой профиль (и запись согласия по 152-ФЗ) на 8-символьную строку, которая телефоном не является. Поскольку телефон — это **ключ склейки** гостевых броней и namespace идемпотентности/рейт-лимита, мусорные значения там дороже обычной валидационной небрежности.

**Направление фикса.** Единая серверная нормализация с проверкой формы (RU + E.164) в одном месте, используемая всеми четырьмя гостевыми эндпоинтами.

**Трудоёмкость:** S

---

## Известные открытые — верифицированный статус

### Три гэпа enforcement — точный статус по каждой поверхности

#### 1. `minBookingHoursAhead` — **enforced, с двумя дырами**

| Поверхность | Статус | Доказательство |
|---|---|---|
| Генерация слотов `/api/public/providers/[id]/slots` | ✅ enforced | `slots/route.ts:76` (`minBookingHoursAhead` в select), `:103` `clampVisibleSlotsHorizon`, `:114` `listBookableSlots` |
| `createBooking` / `createClientBooking` / оба package-пути | ✅ enforced | `booking-core.ts:338` — `assertBookingWindow(startAtUtc, provider, now)`; ошибки `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR` (`policy-enforcement.ts:74-89`) |
| `rescheduleBooking` (перенос) | ✅ enforced по `startAtUtc` | `usecases.ts:201` |
| **`createStudioBooking` (студийный кабинет)** | ❌ **НЕ проверяется** | в `bookings.service.ts:127-351` вызова `assertBookingWindow` нет; проверяются только work-hours + conflict + TimeBlock |
| **`moveStudioBooking`** | ❌ **НЕ проверяется** | `bookings.service.ts:353-626` — то же |
| `model-applications/confirm` | ❌ **НЕ проверяется** | форкнутый путь, только conflict-check |

Для студийного кабинета это, возможно, осознанно (инв. #22 — «studio admin has direct authority»), но нигде не задокументировано как решение; для модель-офферов — просто пропуск.

#### 2. `slotPrecision` — **не enforced нигде за пределами карточки каталога**

Полностью разобрано в **LOGIC-18**. Кратко: единственный потребитель — `catalog-card.tsx:148`. Публичный slots-роут, виджет бронирования и профиль мастера настройку не читают. Формулировка в контексте проекта («`slotPrecision` полный per-viewer-tz рендеринг (частично)») описывает другой аспект — здесь речь о самой области действия настройки.

#### 3. `lateCancelAction` — **не enforced, чисто информационное поле**

```
$ grep -rn "lateCancelAction" src/ prisma/schema/
prisma/schema/provider.prisma:57                                   ← хранение (String @default("none"))
src/lib/schedule/editor.ts:246,388-391,405,470                     ← чтение/запись настройки
src/lib/schedule/editor-shared.ts:95,214-219,235                   ← нормализация
src/features/master/…/rules/cancellation-section.tsx:34,60-61      ← редактор
src/features/studio-cabinet/…/policy-section.tsx:20,38             ← отображение read-only
src/lib/ui/text.ts:6897                                            ← подпись
```
В `cancelBooking.ts`, `flow.ts`, `policy-enforcement.ts` — **ноль** вхождений. Оба кабинета честно это признают в комментариях: `policy-section.tsx:20` — *«`lateCancelAction` stays informational — enforcement is a known [gap]»*, `types.ts:84-86` — *«currently stored but [not enforced]»*. Значение `"fine"` (штраф) неисполнимо и по продуктовой причине — платёжных штрафов в продукте нет.

**Вывод:** статус соответствует заявленному в контексте («`lateCancelAction="fine"` без enforcement»), регрессии нет. Но `cancellationDeadlineHours` — соседнее поле — **enforced** (`cancelBooking.ts:79` → `ensureCancellationDeadline`, `flow.ts:85-107`), так что для пользователя два соседних тумблера в одной секции ведут себя по-разному без каких-либо визуальных отличий.

### Остальные известные открытые

| Пункт | Верифицированный статус |
|---|---|
| OTP plaintext в логах | Подтверждено намеренным (CLAUDE.md rule 9). Не репортится. |
| VK Bot delivery не реализован | Не проверялось (вне scope этого прохода). |
| Версия pgvector на проде | Не проверялось (проход 03). |
| **Регрессии из списка «уже починено»** | **Не обнаружено ни одной.** Проверено точечно: `moveStudioBooking` держит `assertBelongsToStudio` (`bookings.service.ts:381`); `buildPriorBookingsWhere` не эмитит `undefined` в OR (`booking-core.ts:347-354`); `Booking.startAt/endAt` в схеме отсутствуют (`booking.prisma:24-34` — только комментарий об их удалении); `system-message.tsx` использует salon-tz. |

### Точечная проверка таймзон (regression-проход, якорь — Vision `Asia/Yekaterinburg` +5)

`npm run check:tz` (read-only review-aid) даёт **30 кандидатов в 27 файлах**. Каждый разобран вручную:

| Поверхность | Классификация | Вердикт |
|---|---|---|
| **Тексты уведомлений** (живой путь `notifications/booking-notifications.ts:5-7` → `format-booking-when.ts:17-28`) | **salon-tz + метка зоны** | ✅ корректно. Единственное нарушение в домене — мёртвый `service.ts:541-564` (LOGIC-27) |
| **ICS-экспорт** (`bookings/ics-export.ts:49-50`, `fmtUtc`) | **UTC-tech**, `Z`-суффикс, без `TZID` | ✅ корректно по RFC 5545 и явно задокументировано в комментарии |
| **Admin-вьюхи** (платежи, подписки, отзывы, «на платформе с», лента событий) | **viewer-tz** (браузер админа) | ⚠️ защитимо (данные платформенные, не привязаны к салону), но **ни одна поверхность не объявляет источник** и не несёт `// tz-ok:` — формально rule 17 не соблюдён. Отдельно `charts.service.ts:24-28` — реальное расхождение (LOGIC-28) |
| **Биллинговые даты** (`currentPeriodEnd`, `graceUntil`, `createdAt`) | кабинет — **viewer-tz** (`format.ts:47-53` `dateRU`, `plan-card.tsx:29-36` host-геттеры); cron — **не объявлено** | ⚠️ кабинет защитим, но не объявлен; `price-optin-cron.ts:45` — живое нарушение (LOGIC-25) |
| **Таймстемпы отзывов** | публичные профили таймстемпы **не рендерят вообще**; кабинеты — **viewer-tz**, дневная гранулярность | ✅ по существу корректно (совпадает с канонической таблицей скилла), не объявлено |
| **Booking write-path (мастерская сетка)** | ❌ **host-tz браузера** | 🔴 **LOGIC-21** — новое, в §7 скилла отсутствует. Единственная находка, где таймзона портит **записываемое** значение, а не отображение |
| **Дата по умолчанию в booking-визардах** | **viewer-tz** там, где должна быть salon-tz | ⚠️ **LOGIC-26** |

Сводно: **display-слой в booking/schedule-домене чист** — заявленное в скилле состояние подтверждается. Дефекты сконцентрированы в трёх местах, ни одно из которых прошлым свипом не покрывалось: write-path мастерской сетки (LOGIC-21), server-side cron без viewer-контекста (LOGIC-25) и admin/биллинг-поверхности, которые формально корректны, но источник tz не объявляют. Плюс инструментальный gap LOGIC-29, из-за которого корневая причина LOGIC-21 не была видна `check:tz`.

---

## Гипотезы — не доказано

1. **`resolveScheduleVersion` может «поехать назад».** Версия кэша слотов — это `max(updatedAt)` по пяти таблицам (`engine-context.ts:123-145`). Удаление самой свежей строки `ScheduleOverride` (`removeExceptionByDate`, `editor.ts:232`) уменьшает максимум, то есть версия возвращается к более раннему значению, под которым в Redis мог лежать кэш, построенный при другом состоянии расписания. На пути `applyScheduleSnapshot` это закрыто безусловным `invalidateSlotsForMaster` в конце (`editor.ts:568`). Я **не проверил**, есть ли другой вызывающий `removeExceptionByDate`, у которого этой инвалидации нет — вероятно, нет, но доказательства у меня нет.

2. **Serializable + внешний connection pooler.** Гарантия LOGIC-01/инв. #31 держится на том, что PostgreSQL SSI действительно применяется к транзакциям Prisma. Если в проде перед БД встанет PgBouncer в режиме `statement` (не `transaction`/`session`), `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` не сработает как ожидается. Целевая площадка не подтверждена (§8 контекста, «Расхождения в доках»), проверить негде — но это стоит явно зафиксировать в DevOps-чеклисте.

3. **`waitForIdempotencyResult` и типичная длительность транзакции.** LOGIC-10 исходит из того, что Serializable-транзакция создания брони способна превысить 300 мс. Код логирует `transactionMs` (`createBooking.ts:273`), но замеров на реальных данных я не делал — на пустой dev-БД она наверняка укладывается. Насколько часто дефект проявится в проде, не доказано; сам дефект (409 при успешно созданной брони) от этого не зависит.

4. **`ensureNoConflicts` не перепроверяет расписание внутри транзакции.** In-tx проверяются только брони и `TimeBlock`; рабочие часы/выходной/перерывы берутся из предварительного availability-снимка, который читает Redis-кэш (TTL 120 с). Кэш-ключ включает `scheduleVersion`, а `applyScheduleSnapshot` в конце инвалидирует всё, так что окно, похоже, закрыто. Но точку, где расписание меняется **не** через `applyScheduleSnapshot`, я не искал, и утверждать, что таких нет, не могу.

---

## Предлагаемые записи в BACKLOG.md

> `BACKLOG.md` этим аудитом не изменён (параллельно работают ещё четыре прохода). Строки ниже готовы к вмерживанию владельцем как есть.

```markdown
- 🔴 **LOGIC-01 · Conflict-check брони скоупится по providerId → double-booking мастера студии.**
  `ensureNoConflicts` (`booking-core.ts:116-118`) и три её форка фильтруют по `{providerId, masterProviderId}`,
  а брони одного мастера лежат под двумя разными `providerId` (личный профиль vs студия). Генератор слотов
  (`schedule/usecases.ts:310-315`) и TimeBlock (`time-blocks.ts:50-53`) уже скоупятся ПО МАСТЕРУ — привести
  conflict-check к тому же предикату. `createStudioBooking`/`moveStudioBooking` дополнительно не делают
  availability-проверку → дефект детерминированный, без гонки. Календарь студии
  (`schedule-data.service.ts:105`) такие брони тоже не показывает — расширить его запрос.
  Отдельным шагом — DB-констрейнт `EXCLUDE USING gist` как последняя линия. Нарушен инв. #11.

- 🟠 **LOGIC-02 · Переходы статуса брони без оптимистической блокировки → отменённая бронь воскресает.**
  Пять путей (`confirmBooking.ts:181`, `decline-reschedule.ts:49`, `usecases.ts:258`, `cancelBooking.ts:93`,
  `studio/bookings.service.ts:706`) делают `update where:{id}` без ожидаемого статуса. Ввести общий
  `applyBookingTransition(tx, {id, from[], to})` на `updateMany` + 409 при `count===0`; чтение брони в
  `confirmBooking` перенести внутрь Serializable-транзакции.

- 🟠 **LOGIC-03 · Клиент задаёт длительность брони при переносе.**
  `bookingRescheduleSchema` (`validation/bookings.ts:61-78`) проверяет только `end > start`;
  `rescheduleBooking` не вызывает `resolveBookingCore` и не проверяет ни availability, ни рабочие часы,
  а `confirmBooking.ts:190-198` применяет `proposed*` дословно. Принимать только `startAtUtc`,
  `endAtUtc` выводить на сервере; подключить work-hours-guard, уже используемый в studio-move.

- 🟠 **LOGIC-04 · Мастер отменяет один компонент пакета в обход инв. #34.**
  `updateMasterBookingStatus` (`studio/bookings.service.ts:697-723`) не смотрит `bookingPackageId`
  (grep по `src/lib/studio/` — 0 совпадений), в отличие от `cancelBooking.ts:44-51`. Ломает
  «Σ priceSnapshot == totalKopeks». Делегировать в `cancelSoloPackageBooking` либо вернуть 409.

- 🟠 **LOGIC-05 · «Не пришёл» проставляется только ДО начала приёма.**
  `studio/bookings.service.ts:677-679` отбивает `IN_PROGRESS`/`FINISHED` до ветки записи, а `NO_SHOW`
  не входит в `isRejectAction`/`isCancelAction`. Семантика вывернута: метрика неявок всегда нулевая.

- 🟠 **LOGIC-06 · model-applications/confirm — пятый форк создания брони без TimeBlock-guard.**
  `api/model-applications/[applicationId]/confirm/route.ts:252-297` копирует conflict-check вместо
  `ensureNoConflicts`, из-за чего пропускает `assertNoTimeBlockConflict`. Заменить на общий примитив.

- 🟠 **LOGIC-07 · Cron продления: нет лока и нет per-item изоляции ошибок.**
  `api/billing/renew/run/route.ts` — ни Redis-лока, ни `FOR UPDATE`; тело цикла (168-368) без try/catch,
  внешнего try тоже нет → одно исключение обрывает весь батч и фазы trial/price-optin (`:536`, `:547`).
  Двойного списания нет (`BillingPayment.idempotenceKey @unique`), но прогон теряется молча.

- 🟠 **LOGIC-21 · Клик по пустой ячейке в мастерской сетке пишет UTC в таймзоне БРАУЗЕРА.**
  `empty-cells-overlay.tsx:59` — `new Date(y, m-1, d, hh, mm, 0, 0)` от salon-local минут;
  `timezone` есть в `week-grid-column.tsx:29`, но в overlay (`:83-89`) не передаётся; модаль
  (`manual-booking-modal.tsx:82-90, 112`) декодирует/кодирует теми же host-геттерами. Для Vision (+5)
  и админа из Москвы (+3) бронь сохраняется на 2 часа мимо. Фикс-паттерн уже есть:
  `studio-cabinet/schedule/lib/datetime-input.ts`. Единственный tz-дефект на write-path.

- 🟠 **LOGIC-22 · Истёкшая сессия: студийная бронь молча уходит гостевым путём и падает CONSENT_REQUIRED.**
  `proxy.ts:270-279` кладёт обновлённую cookie только в ОТВЕТ, `requestHeaders` не переписываются →
  `getSessionUserFromRequest` (`session.ts:83-87`) видит протухший токен → `/api/bookings:101-103`
  уходит в гостевую ветку, а клиент consent не прислал (`booking-flow.tsx:488`, `isGuest` устарел).
  Со второй попытки проходит. Плюс: шесть самых ответственных форм не используют `fetchWithAuth`
  (`http/fetch-with-auth.ts:28-41`) и на 401 показывают generic-ошибку без редиректа на логин.

- 🟡 **LOGIC-08 · Двойной клик по «Оплатить» → необработанный 500.**
  `billing/checkout/route.ts:217` — `create()` вне try/catch, P2002 улетает наружу. Ловить и
  перечитывать по ключу, как в `mrr-snapshot.ts:135-150`.

- 🟡 **LOGIC-09 · Пакетные /book-роуты не поддерживают `x-idempotency-key`** (инв. #28).
  Двойной сабмит успешного пакета отвечает «Это время уже занято». Протянуть ключ в
  `createSoloPackageBooking`/`…Studio`, кэшировать по `bookingPackageId`.

- 🟡 **LOGIC-10 · `DUPLICATE_REQUEST` отображается как конфликт слота.**
  `idempotency.ts:63-76` ждёт 300 мс, дальше 409; клиент (`booking-flow-stepper.tsx:359-365`) любой 409
  трактует как занятый слот и ротирует ключ. Разделить коды; увеличить бюджет ожидания.

- 🟡 **LOGIC-11 · `ScheduleOverride` без `@@unique([providerId,date])` + check-then-insert.**
  `editor.ts:174-213`; guard рабочих часов берёт `findFirst` без `orderBy`
  (`studio/bookings.service.ts:76`), движок — список. Дедуп-скрипт + unique + upsert.

- 🟡 **LOGIC-12 · `applyScheduleSnapshot` не атомарен — можно стереть неделю мастера.**
  `editor.ts:156-159` (`deleteMany`+`createMany` вне транзакции), `:546-568` (четыре независимых шага).
  Обрыв между шагами оставляет 0 `WeeklyScheduleDay` → мастер исчезает из слотов молча.

- 🟡 **LOGIC-13 · День-выходной: отмены и запись расписания не атомарны; пакетная бронь роняет цикл.**
  `api/cabinet/master/schedule/route.ts:611` vs `:648`; `listDayOffConflicts` не помечает пакетных детей
  как неотменяемые, а `cancelBooking.ts:44-51` на них бросает.

- 🟡 **LOGIC-14 · `/api/billing/checkout` не в `SENSITIVE_ROUTE_PREFIXES`** (`rate-limit/index.ts:22-34`) →
  при outage Redis не fail-closed, хотя это денежный мутирующий эндпоинт (инв. #6).

- 🟡 **LOGIC-15 · `recoverStuckJobs` не атомарен** (`queue/queue.ts:421,431`): результат `lRem` не
  проверяется перед безусловным `lPush`. При ≥2 воркерах дублируется `telegram.send` и
  `notification.billing.plan-edited.mass`. Проверять `removed > 0`.

- 🟡 **LOGIC-16 · Пересчёт рейтинга теряет обновления** (`reviews/service.ts:453` — default-изоляция,
  `:223-245` — aggregate+update). Serializable + ретрай либо вынести в идемпотентную задачу очереди.

- 🔵 **LOGIC-17 · Studio create/move читают всю историю броней мастера внутри Serializable**
  (`studio/bookings.service.ts:250-259`, `:514-524`) — predicate-lock на всю таблицу → растущая доля
  ложных 409. Добавить фильтр окна (или перейти на `ensureNoConflicts`).

- 🔵 **LOGIC-18 · `slotPrecision` не применяется нигде, кроме карточки каталога.**
  Публичный slots-роут и виджет бронирования поле не читают. Либо расширить, либо переименовать
  настройку так, чтобы «только каталог» читалось из названия.

- 🔵 **LOGIC-19 · `TimeBlock.masterId` без FK** (`schedule.prisma:186`) → блоки-сироты, невидимые
  для DMMF-guard инв. #38.

- 🟡 **LOGIC-23 · Автосейв-хуки без in-flight guard'а** (`use-profile-autosave.ts:66-76`,
  `use-auto-save.ts:36,54-56` — `signal` не передаётся в `fetch`, `use-autosave.ts:47,84-90` —
  `inFlightRef` не читается как гейт). Перекрывающиеся PATCH'и; для расписания это источник
  дубликатов `ScheduleOverride` (LOGIC-11) и P2002 (LOGIC-12).

- 🟡 **LOGIC-24 · `PATCH /api/me` валидирует `displayName`/`address` и молча их выбрасывает**
  (`api/me/route.ts:46-60` вырезает дважды, `users/schemas.ts:22,35` их описывает) → 200 OK на
  проигнорированную операцию. Критично для будущего `MOBILE-API`.

- 🟡 **LOGIC-25 · Дедлайн opt-in-окна рендерится cron'ом без таймзоны**
  (`price-optin-cron.ts:45` → `format.ts:47-53` `dateRU` без `timeZone`, серверный контекст без
  браузера). Риск сдвига даты на границе суток. Ср. `format-booking-when.ts:17-28`, где правило соблюдено.

- 🟡 **LOGIC-26 · Дата по умолчанию в booking-визардах — «сегодня» посетителя, не студии**
  (`studio-booking.ts:77-82` host-геттеры → `booking-flow.tsx:75,267`, `studio-package-flow.tsx:54-67`).
  Заменить на `toLocalDateKey(new Date(), studioTimezone)`.

- 🔵 **LOGIC-20 · Нет CHECK-констрейнтов** на `priceSnapshot >= 0`, `durationSnapshotMin > 0`,
  `rating BETWEEN 1 AND 5`, `bufferBetweenBookingsMin BETWEEN 0 AND 30`.

- 🔵 **LOGIC-27 · Мёртвый `buildBody` с захардкоженным `timeZone: "UTC"`** (`notifications/service.ts:541-564`,
  боевых вызовов 0). Удалить или привести к `formatBookingWhenLabel`, пока его не переиспользовали «по образцу».

- 🔵 **LOGIC-28 · Подписи admin-графика в ambient-tz процесса при UTC-бакетировании**
  (`charts.service.ts:24-28` vs `shared.ts:36-41`). Добавить `timeZone: "UTC"`.

- 🔵 **LOGIC-29 · `check:tz` не видит shorthand `{ timeZone }`** → 5 ложных срабатываний из 30.
  Расширить `TZ_AWARE_RE` до `/timeZone\b/` и покрыть многоаргументный `new Date(y,m,d,hh,mm)`
  (из-за его отсутствия корневая причина LOGIC-21 инструменту не видна).

- 🔵 **LOGIC-30 · Серверная проверка телефона слабее клиентской**
  (`api/public/bookings/route.ts:54` — длина ≥ 8 против 10 цифр на клиенте;
  `otp.ts:4-9` `normalizePhone` формы не проверяет). Телефон — ключ склейки гостевых броней
  и namespace идемпотентности, мусор там дороже обычного.
```

---

## План фиксов (упорядоченный, каждый пункт = один коммит)

| # | Промпт | Содержание | Почему в этом порядке |
|---|---|---|---|
| 1 | **FIX-LOGIC-01-SCOPE** | Один master-скоупный предикат конфликта; `createStudioBooking`/`moveStudioBooking`/`model-applications-confirm` переводятся на `ensureNoConflicts`; календарь студии видит брони своих мастеров. Закрывает LOGIC-01, LOGIC-06, LOGIC-17. Тест — не-вакуумный guard (сломать скоуп → тест обязан упасть). | Единственный P0; чинит три находки разом |
| 2 | **FIX-LOGIC-02-TRANSITIONS** | `applyBookingTransition` на `updateMany` с ожидаемым статусом; чтение брони внутрь tx в `confirmBooking`. Пять путей. | Второй по риску; без него любой конкурентный сценарий из #1 остаётся полуоткрытым |
| 3 | **FIX-LOGIC-03-RESCHEDULE-DURATION** | Reschedule принимает только `startAtUtc`; `endAtUtc` — с сервера; подключить work-hours + availability. | Независим от #1-2, но трогает те же файлы — после них |
| 4 | **FIX-LOGIC-04-05-MASTER-STATUS** | Guard пакетного ребёнка + починка семантики `NO_SHOW` в `updateMasterBookingStatus`. Обе находки в одной функции. | Один файл, одна функция — один коммит |
| 5 | **FIX-LOGIC-21-TZ-WRITE-PATH** | Протянуть `timezone` в `EmptyCellsOverlay` + `ManualBookingModal`, перевести обе конверсии на `salonInputToUtcIso`/`utcIsoToSalonInput`. Тест с `TZ=Europe/Moscow` против салона `+5`, падающий до фикса. | Единственный tz-дефект, портящий **записываемое** значение; изолирован, быстрый |
| 6 | **FIX-LOGIC-07-RENEW-CRON** | Redis-лок на прогон + per-subscription try/catch + сводка `{processed, failed}` в ответе. | Деньги; независим от booking-домена, можно параллелить |
| 7 | **FIX-LOGIC-22-SESSION-EXPIRY** | Шесть высокоставочных форм → `fetchWithAuth`; `AUTH_REQUIRED`/`CONSENT_REQUIRED` в `booking-error.tsx`; решить судьбу middleware-refresh (переписывать `requestHeaders` либо честно отдавать 401). | Затрагивает те же формы, что #8-9 — делать до них |
| 8 | **FIX-LOGIC-08-10-IDEMPOTENCY-UX** | checkout: P2002 → перечитать; booking-flow: разделить `DUPLICATE_REQUEST` и `SLOT_CONFLICT`; увеличить бюджет ожидания. | Чистый UX двойного клика на двух воронках |
| 9 | **FIX-LOGIC-09-PACKAGE-IDEMPOTENCY** | `x-idempotency-key` на обоих package-`/book`, кэш по `bookingPackageId`. | После #8 — тот же клиентский паттерн |
| 10 | **FIX-LOGIC-11-12-13-23-SCHEDULE-ATOMICITY** | Миграция `@@unique([providerId,date])` + дедуп-скрипт; `applyScheduleSnapshot` в одну транзакцию; день-выходной — атомарно + пакетные дети неотменяемы; in-flight guard в автосейв-хуках. | Одна миграция + один домен. Автосейв здесь же: он и есть источник конкурентных вызовов |
| 11 | **FIX-LOGIC-14-15-16-RESILIENCE** | `/api/billing` в sensitive-префиксы; `lRem`-результат в `recoverStuckJobs`; рейтинг — Serializable+ретрай. | Три маленьких независимых правки |
| 12 | **FIX-LOGIC-TZ-DECLARATIONS** | LOGIC-25 (`dateRU` с обязательной tz на серверных путях), LOGIC-26 (`todayKey(studioTimezone)`), LOGIC-27 (удалить мёртвый билдер), LOGIC-28 (`timeZone: "UTC"` на графике), LOGIC-29 (регулярка `check:tz`), плюс `// tz-ok:` на admin/биллинг-поверхностях. | Один tz-коммит; после него `check:tz` снова читаем |
| 13 | **FIX-LOGIC-24-30-API-CONTRACTS** | `/api/me` перестаёт молча глотать поля; единая серверная валидация формы телефона на четырёх гостевых эндпоинтах. | Подготовка к `MOBILE-API`; независимо от всего выше |
| 14 | **FIX-LOGIC-DB-CONSTRAINTS** | `EXCLUDE USING gist` на пересечения броней (**после** #1, когда предикат уже правильный), FK на `TimeBlock.masterId`, CHECK'и из LOGIC-20; всё — в `scripts/raw-sql-objects.mjs`. | Последняя линия обороны; ставится, когда приложение уже корректно |
| 15 | **DECIDE-STUDIO-MASTER-PUBLIC-PROFILE** | Продуктовое решение: принимает ли мастер студии брони через личный профиль. Не код. | Влияет на масштаб #1, но #1 нужен в любом случае |

---

## 🚨 Pre-launch риски, за которыми следить

1. **Гарантия конкурентности при создании брони — не полная.** `isolationLevel: Serializable` действительно стоит на всех шести booking-write-путях (проверено построчно: `createBooking.ts:265`, `createClientBooking.ts:243`, `confirmBooking.ts:203`, `studio/bookings.service.ts:321` и `:590`, `package-booking.ts:544`, `package-booking-studio.ts:339`, `model-applications/confirm/route.ts:362`) — заявленное в инв. #31 соблюдено. **Но SSI защищает только внутри одного скоупа предиката**, а предикат скоупится по `providerId`, тогда как один мастер имеет брони под двумя разными `providerId` (**LOGIC-01**). До фикса гарантия «не бывает пересечений» неверна, и для студийного кабинета — даже без гонки. **DB-констрейнта, который поймал бы это независимо от приложения, нет** (гэп G1).

2. **Ни один переход статуса брони не защищён от протухшей вкладки** (**LOGIC-02**). Отменённая бронь воскресает в CONFIRMED, `cancelledAtUtc` при этом остаётся заполненным. Гонки в миллисекунды не требуется — достаточно открытой вкладки мастера.

3. **Идемпотентность платежей и вебхуков — состояние на 2026-08-04:**
   - платёж YooKassa: `Idempotence-Key` отправляется (`payments/yookassa/client.ts:88-103`), ключ детерминированный (checkout — бакет по UTC-часу, `checkout/route.ts:195-197`; renewal — по UTC-дню, `renew/run/route.ts:285`); `BillingPayment.idempotenceKey @unique` (`billing.prisma:158`) — **двойного списания нет, подтверждено**;
   - но P2002 не обрабатывается **нигде**: в checkout это 500 пользователю (**LOGIC-08**), в renew-cron — обрыв всего батча (**LOGIC-07**);
   - вебхук: дедуп через early-return по статусу (`webhook-processor.ts:180-186`), enqueue **не** дедуплицирован (`queue/queue.ts:196-211`, id случайный) — держится на том, что воркер один и обрабатывает задачи строго последовательно (`worker.ts:689-707`). **Это не enforce'ится кодом.** Вторая реплика воркера превращает это в реальную гонку двойного гранта;
   - при провале enqueue роут отвечает 503 → ЮКасса ретраит (`webhook/route.ts:143`) — корректно.

4. **Неидемпотентные ретраящиеся задачи.** Безопасны: `booking.reminder` (атомарный claim `updateMany … WHERE reminderXhSentAt IS NULL`, `reminders.ts:102-119` — образцовая реализация), `yookassa.webhook`, `mrr.snapshot.daily`, `media.purge`/`cleanup`, `visual_search_index`, `availableToday.recompute`. **Не безопасны:** `telegram.send` (`telegram/client.ts:11-34` — голый fetch, крэш между успешной отправкой и `acknowledge` даёт повтор) и `notification.billing.plan-edited.mass` (`notifications/admin-initiated.ts:117-152` — при ретрае заново рассылает **всем** активным подписчикам in-app + push + Telegram, per-recipient claim'а нет). Оба усиливаются гонкой `recoverStuckJobs` (**LOGIC-15**). У `Notification` нет unique-констрейнта (`notification.prisma:34-37`) — дедуп целиком application-level и применён непоследовательно.

5. **Точный статус трёх известных гэпов enforcement** (детали выше в разделе «Известные открытые»):
   - `minBookingHoursAhead` — **enforced** на публичных путях и переносе; **НЕ enforced** в `createStudioBooking`, `moveStudioBooking`, `model-applications/confirm`;
   - `slotPrecision` — **НЕ enforced нигде**, кроме карточки каталога; публичный виджет бронирования всегда отдаёт точные времена;
   - `lateCancelAction` — **НЕ enforced**, чисто информационное поле (соответствует заявленному, регрессии нет). Соседнее `cancellationDeadlineHours` при этом enforced — два визуально одинаковых тумблера ведут себя по-разному.

6. **Расписание переживает частичную запись.** `applyScheduleSnapshot` не транзакционен (**LOGIC-12**): обрыв между `deleteMany` и `createMany` (`editor.ts:156-159`) оставляет мастера с нулём рабочих дней и выключает его из выдачи слотов молча. Автосейв (debounce 500 мс) увеличивает частоту параллельных вызовов. Для pre-launch это стоит проверить руками: сохранить расписание, убить процесс между шагами, посмотреть, остаётся ли мастер бронируемым.

7. **Cron продления не переживает одну плохую подписку** (**LOGIC-07**). Отсутствие внешнего try/catch означает: первое же исключение в цикле оставляет остальных клиентов без продления в этот день, а `trial-cron` и `price-optin-cron` вообще не запускаются. Лока на пересекающиеся прогоны тоже нет — при ретрае внешнего планировщика фаза 1 продублирует аудит-записи и уведомления об истечении.

8. **Serializable ↔ connection pooler (не доказано, но проверить на деплое).** Вся конкурентная гарантия booking-домена опирается на то, что `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` реально доезжает до PostgreSQL. PgBouncer в режиме `statement` это ломает. Площадка деплоя в доках не согласована (§8 контекста) — вопрос в DevOps-чеклист.

9. **Таймзона портит записываемое значение — один раз, но по-настоящему** (**LOGIC-21**). Display-слой в booking/schedule чист (разобраны все 30 кандидатов `check:tz` + пять названных поверхностей), но клик по пустой ячейке в мастерской сетке конвертирует salon-local минуты через `new Date(y, m-1, d, hh, mm)` — конструктор **браузера**. Для Vision (+5) с админом из Москвы (+3) бронь ложится на 2 часа мимо, молча. `check:tz` этого не видит (LOGIC-29 — регулярка не покрывает многоаргументный `new Date`). Перед запуском — ручной прогон: `TZ=Europe/Moscow` в браузере → создать бронь кликом по сетке мастера Vision → сверить `startAtUtc` в БД.

10. **Истёкшая сессия ломает первую попытку брони и «чинится» сама на второй** (**LOGIC-22**). Middleware обновляет сессию, но новая cookie достаётся только ответу — текущий запрос выполняется неаутентифицированным, уходит в гостевую ветку и падает на `CONSENT_REQUIRED`. Ни одна из шести самых ответственных форм не использует существующий 401-перехватчик `fetchWithAuth`. При 2-часовом TTL access-токена это повседневный сценарий, а не край. Побочный эффект: зарегистрированный клиент создаёт бронь как гость на phone-keyed профиль.

---

### Context updates

**Не затронуто.** Аудит read-only, схема/роуты/env/core-flows не менялись → структурный триггер (`docs/QUALITY-GATES.md` § «Обновление контекста») не сработал, `MASTERRYADOM_AI_CONTEXT.md` не правился.

Замечание для будущего рефреша (**после** фиксов, не сейчас): §12 инв. #11 и #31 формулируют гарантию отсутствия пересечений как безусловную. LOGIC-01 показывает, что она условна — держится на скоупе предиката, который для мастера студии неверен. Когда FIX-LOGIC-01-SCOPE будет влит, формулировку инварианта стоит уточнить («скоуп предиката — МАСТЕР, а не пара provider+master») в том же изменении.
