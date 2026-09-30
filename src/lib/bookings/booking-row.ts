import { Prisma, type BookingSource } from "@prisma/client";

import type { BookingTx } from "@/lib/bookings/booking-transaction";
import { assertClearanceMatches, type BookingTimeClearance } from "@/lib/bookings/booking-time-policy";

/**
 * FIX-C1 · SMOKE-01 · F1 — ЕДИНСТВЕННЫЙ writer строк `Booking`.
 *
 * ## Что было
 *
 * Бронь, снятую через **собственную публичную страницу записи студии**, кабинет
 * этой же студии показывал в журнале, но не мог ни перенести, ни переназначить
 * мастера: любое действие отвечало `404 BOOKING_NOT_FOUND`. Причина —
 * расхождение двух ответов на вопрос «чья это бронь»:
 *
 *   - **журнал и календарь** скоупились `OR: [{ studioId }, { providerId }]`
 *     (`studio-cabinet/bookings/server/bookings-list.service.ts`) — то
 *     есть ПОКАЗЫВАЛИ по providerId;
 *   - **авторизация действия** идёт через `assertBelongsToStudio("booking", …)`
 *     (`lib/studio/tenancy.ts:80`) — `where: { id, studioId }`, то есть
 *     РАЗРЕШАЕТ только по `studioId`.
 *
 * `createBooking` (публичный/воронковый путь) `studioId` не выставлял вообще —
 * слова `studioId` в файле не было. `createClientBooking` (легаси) и
 * подтверждение модель-оффера — тоже. Остальные четыре пути его выставляли, и
 * именно поэтому дефект выглядел как «иногда не работает».
 *
 * ## Сейчас: показывает = разрешает = `studioId` (29.09 доработки · 08)
 *
 * С тех пор как `studioId` выводит только этот writer, ветка `providerId` в
 * списках стала избыточной и свёрнута: журнал, календарь, KPI, клиенты,
 * аналитика, удаление кабинета и уход мастера берут `studioBookingsWhere`
 * (`lib/studio/booking-scope.ts`) — то же поле, что `tenancy.ts`. Старые строки
 * выровнены миграцией `20260929130000_booking_studio_id_backfill`, а дрейф
 * колонки мимо writer'а (`updateMany` пост-деплоя) ловит `deploy:post`
 * (`reportBookingStudioScopeDrift`): строка, у которой `studioId` разошёлся с
 * поверхностью, из журнала студии теперь пропадает, а не становится
 * неуправляемой.
 *
 * ## Почему ЭТОТ writer, а не «дописать поле в трёх местах»
 *
 * Правило, которое каждый вызывающий обязан вспомнить, — это правило, которое
 * следующий вызывающий забудет: ровно так и появились три пропуска из семи.
 * Здесь применён тот же приём, что `applyBookingTransition` для переходов
 * статуса (LOGIC-02): одна точка записи, и **тип не даёт вызывающему
 * промолчать**.
 *
 * Две половины типа делают разную работу:
 *
 *   - `studioId` **вырезан** из входа (`Omit`). Передать его нельзя, поэтому
 *     нельзя и передать неверный: значение выводится здесь, из `providerId`.
 *   - `source` **сделан обязательным** (в схеме у него `@default(MANUAL)`, то
 *     есть молчание вызывающего означало «звонок»). Из полезной нагрузки он не
 *     выводится — это факт о поверхности, и его обязан назвать вызывающий.
 *
 * ## Почему `studioId` выводится из `providerId`, а не из членства мастера
 *
 * Членство (`Provider.studioId`) отвечает на вопрос «в какой студии состоит
 * мастер», а нужен ответ на «через чью поверхность снята бронь». Это разные
 * вопросы: мастер студии, ведущий частную практику, принимает записи и через
 * личный профиль (`/u/<username>`) — это решение владельца (FIX-D1; с
 * STUDIO-MASTER-PROFILES — только его собственные услуги), и такие брони студия
 * не показывает и не должна ими управлять. Вывод из членства
 * отдал бы их студии, вывод из поверхности — нет.
 *
 * Второе, менее заметное: членство меняется во времени. Мастер, ушедший из
 * студии, задним числом переписал бы принадлежность всей своей истории. Колонка
 * же — исторический факт (`onDelete: SetNull` на связи прямо это и утверждает:
 * строка переживает удаление студии, обнулив ссылку).
 *
 * ## ⚠️ Две системы id
 *
 * `Provider.studioId` ссылается на **`Provider.id`** студии, а `Booking.studioId`
 * — на **`Studio.id`** (ловушка описана в `lib/studio/tenancy.ts:19`). Здесь
 * резолвится именно вторая: `Studio` по своему `providerId @unique`.
 *
 * Стоимость — один индексированный point-read на создание брони. Он намеренно
 * идёт внутри той же транзакции, что и вставка: альтернатива «резолвить снаружи
 * и передавать» вернула бы параметр, который вызывающий может рассинхронизовать
 * с `providerId`, то есть вернула бы ровно тот класс дефекта, ради которого
 * writer и заведён.
 */

/**
 * Полезная нагрузка строки брони без двух полей, за которые отвечает writer.
 * `source` возвращён обязательным — молчание вызывающего больше не значит
 * «MANUAL» (в журнале студии это рендерится как «Звонок», и именно так
 * онлайн-запись самообслуживанием подписывалась телефонной — SMOKE-01 · F1).
 */
export type BookingRowData = Omit<
  Prisma.BookingUncheckedCreateInput,
  "studioId" | "studio" | "source"
> & { source: BookingSource };

/**
 * Создаёт строку `Booking`, выведя `studioId` из поверхности (`providerId`).
 *
 * FIX-C6: клиент — `BookingTx`, то есть транзакция, открытая
 * `bookingTransaction` (`Serializable` по построению, инв. #31). У этого типа
 * **нет метода `booking.create`** — право вставки возвращает себе только тело
 * этой функции, единственным приведением ниже. Поэтому «второй writer» теперь
 * не компилируется, а не «ловится регекспом»: и `tx.booking.create(…)`, и
 * обходная форма `const b = tx.booking; b.create(…)` одинаково падают на
 * `typecheck`.
 */
export async function createBookingRow<S extends Prisma.BookingSelect>(
  db: BookingTx,
  args: {
    data: BookingRowData;
    select: S;
    /**
     * 29.09 доработки · 07 — разрешение на время: выдают только функции
     * `booking-time-policy.ts`, каждая после проверки своей строки политики
     * (таблица — в шапке `policy-enforcement.ts`). Путь без выбора политики не
     * компилируется.
     */
    timePolicy: BookingTimeClearance;
  },
): Promise<Prisma.BookingGetPayload<{ select: S }>> {
  assertClearanceMatches(args.timePolicy, args.data.startAtUtc as Date | string);
  const studio = await db.studio.findUnique({
    where: { providerId: args.data.providerId },
    select: { id: true },
  });

  // 🔴 ЕДИНСТВЕННОЕ место в `src/`, где клиент возвращает себе право вставки
  // строки `Booking`. Инвариант #45 держится тем, что этого приведения больше
  // нигде нет, — а не тем, что никто не написал `booking.create`.
  const writable = db as unknown as Prisma.TransactionClient;

  const created = await writable.booking.create({
    data: { ...args.data, studioId: studio?.id ?? null },
    select: args.select,
  });

  // Prisma не выводит payload через generic-параметр `select`, поэтому форма
  // объявлена в сигнатуре и подтверждается здесь. Само `select` уходит в запрос
  // дословно — расхождения формы с типом быть не может.
  return created as Prisma.BookingGetPayload<{ select: S }>;
}
