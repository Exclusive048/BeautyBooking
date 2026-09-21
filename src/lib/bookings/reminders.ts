import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";
import { enqueue } from "@/lib/queue/queue";
import {
  BOOKING_REMINDER_JOB_TYPE,
  createBookingReminderJob,
  type BookingReminderKind,
  type BookingReminderPayload,
} from "@/lib/queue/types";
import {
  createBookingReminderNotifications,
  publishNotifications,
} from "@/lib/notifications/service";
import { sendBookingReminderTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import { deliverExternalChannels } from "@/lib/notifications/delivery";
import { resolveNotificationOpenHref } from "@/lib/notifications/presentation";

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;

const REMINDER_24H_MS = 24 * HOURS;
const REMINDER_2H_MS = 2 * HOURS;
const MIN_LEAD_MS = 15 * MINUTES;
const SINGLE_REMINDER_THRESHOLD_MS = 2.5 * HOURS;

type ReminderScheduleItem = {
  kind: BookingReminderKind;
  runAt: Date;
};

function normalizeStartAt(startAtUtc: Date | null | undefined): Date | null {
  if (!startAtUtc) return null;
  if (!(startAtUtc instanceof Date)) return null;
  if (Number.isNaN(startAtUtc.getTime())) return null;
  return startAtUtc;
}

export function resolveReminderSchedule(startAtUtc: Date, now = new Date()): ReminderScheduleItem[] {
  const start = normalizeStartAt(startAtUtc);
  if (!start) return [];
  const nowTime = now.getTime();
  const startTime = start.getTime();
  if (startTime <= nowTime) return [];

  const diff = startTime - nowTime;
  if (diff < MIN_LEAD_MS) return [];

  const items: ReminderScheduleItem[] = [];
  const twoHoursAt = new Date(startTime - REMINDER_2H_MS);
  const safeTwoHoursAt = new Date(Math.max(twoHoursAt.getTime(), nowTime));
  items.push({ kind: "REMINDER_2H", runAt: safeTwoHoursAt });

  if (diff >= SINGLE_REMINDER_THRESHOLD_MS) {
    const twentyFourAt = new Date(startTime - REMINDER_24H_MS);
    if (twentyFourAt.getTime() > nowTime) {
      items.push({ kind: "REMINDER_24H", runAt: twentyFourAt });
    }
  }

  return items;
}

export async function scheduleBookingReminders(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      silentMode: true,
      provider: { select: { remindersEnabled: true } },
    },
  });

  if (!booking || booking.status !== "CONFIRMED") return;
  if (!booking.startAtUtc) return;
  if (booking.silentMode) return;
  if (!booking.provider.remindersEnabled) return;

  const schedule = resolveReminderSchedule(booking.startAtUtc);
  if (schedule.length === 0) return;

  const startAtIso = booking.startAtUtc.toISOString();
  await Promise.all(
    schedule.map((item) =>
      enqueue(
        createBookingReminderJob(
          {
            bookingId,
            kind: item.kind,
            startAtUtc: startAtIso,
          },
          {
            runAt: item.runAt.getTime(),
          }
        )
      )
    )
  );
}

/**
 * RES-03/RES-15 — планирование напоминаний ПОСЛЕ коммита брони.
 *
 * `scheduleBookingReminders` бросает: `enqueue` в проде при недоступном Redis
 * поднимает ошибку (`queue.ts` — memory-fallback только вне прода). На
 * пост-коммитном участке это означало 500 на уже созданную бронь: клиент
 * видит «Не удалось создать запись» и жмёт ещё раз, а без
 * `x-idempotency-key` (гостевой виджет, мобильные клиенты) создаёт ВТОРУЮ.
 * Напоминание — не корректностный гейт: бронь уже валидна и видна обеим
 * сторонам, отсутствие напоминания её не отменяет.
 *
 * Поэтому все пост-коммитные вызывающие идут через эту обёртку, а не через
 * собственный `try/catch` (он стоял ровно в одном файле из трёх — асимметрия
 * и была находкой). Сырой `scheduleBookingReminders` остаётся для путей, где
 * отказ обязан быть виден вызывающему.
 */
export async function scheduleBookingRemindersSafe(bookingId: string): Promise<void> {
  try {
    await scheduleBookingReminders(bookingId);
  } catch (error) {
    logError("Failed to schedule booking reminders", {
      bookingId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * RES-14 — восстановление напоминаний из БД.
 *
 * До этого напоминание существовало ТОЛЬКО как задача в очереди: строка
 * `Booking` — источник истины, из которого его можно переродить, но никто
 * этого не делал. AOF Redis (`--appendonly yes`) риск сильно снижает, но
 * `appendfsync everysec` оставляет окно ≤1 с, а ручной `FLUSHALL` или
 * пересоздание тома теряют очередь целиком и безвозвратно.
 *
 * Свип — ДЕТЕКТОР ОПОЗДАНИЯ, а не периодическая перепланировка: кандидат
 * появляется, только если момент отправки уже прошёл на `GRACE`, а отметка
 * так и не поставлена. На здоровой системе (задача уходит в очередь и
 * срабатывает в свой `runAt` за секунды) кандидатов ноль — то есть дубликатов
 * задач свип не создаёт вовсе. Это и есть причина, по которой он смотрит на
 * «просрочено», а не на «запланировано»: очередь снаружи не видна, а любой
 * DB-флаг «запланировано» пережил бы потерю очереди и тем самым запретил бы
 * восстановление ровно в том случае, ради которого свип и написан.
 *
 * 🔴 Восстанавливается только напоминание за 2 часа. Оно есть у КАЖДОЙ
 * подходящей брони, поэтому «просрочено и не отправлено» — точный признак
 * потери. У напоминания за 24 часа такого признака нет: оно планируется лишь
 * когда до начала было ≥2.5 ч И момент «минус сутки» был в будущем, а
 * подтверждение брони могло случиться уже после него. Единственный доступный
 * заменитель (`createdAt`) даёт ложные срабатывания, и цена ошибки
 * несимметрична: клиенту уйдёт «напоминаем за сутки» за три часа до визита.
 * Потерянное 24-часовое напоминание догоняется двухчасовым.
 */
const REMINDER_RECONCILE_GRACE_MS = 10 * MINUTES;
const REMINDER_RECONCILE_BATCH = 200;

export async function reconcileBookingReminders(
  now = new Date()
): Promise<{ candidates: number; rescheduled: number }> {
  const overdueBefore = new Date(now.getTime() + REMINDER_2H_MS - REMINDER_RECONCILE_GRACE_MS);

  const candidates = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      silentMode: false,
      reminder2hSentAt: null,
      // Момент отправки прошёл, а визит ещё впереди: напоминать задним числом
      // бессмысленно, и `processBookingReminder` такую задачу всё равно
      // отбросит.
      startAtUtc: { gt: now, lte: overdueBefore },
      provider: { remindersEnabled: true },
    },
    select: { id: true },
    orderBy: { startAtUtc: "asc" },
    take: REMINDER_RECONCILE_BATCH,
  });

  let rescheduled = 0;
  for (const booking of candidates) {
    // Через тот же планировщик, а не прямым `enqueue`: он заново выводит
    // расписание от текущего момента и сам решает, что ещё уместно, — прямая
    // постановка обошла бы эту проверку и могла отправить неуместное.
    await scheduleBookingRemindersSafe(booking.id);
    rescheduled += 1;
  }

  return { candidates: candidates.length, rescheduled };
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function markReminderSent(
  tx: DbClient,
  bookingId: string,
  kind: BookingReminderKind
): Promise<boolean> {
  const data =
    kind === "REMINDER_24H"
      ? { reminder24hSentAt: new Date() }
      : { reminder2hSentAt: new Date() };

  const where =
    kind === "REMINDER_24H"
      ? { id: bookingId, reminder24hSentAt: null }
      : { id: bookingId, reminder2hSentAt: null };

  const result = await tx.booking.updateMany({ where, data });
  return result.count > 0;
}

export async function processBookingReminder(payload: BookingReminderPayload): Promise<void> {
  const jobStart = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: payload.bookingId },
      select: {
        id: true,
        status: true,
        startAtUtc: true,
        clientUserId: true,
        silentMode: true,
        reminder24hSentAt: true,
        reminder2hSentAt: true,
        provider: { select: { remindersEnabled: true } },
      },
    });

    if (!booking) return { sent: false };
    if (booking.status !== "CONFIRMED") return { sent: false };
    if (!booking.startAtUtc) return { sent: false };
    if (booking.startAtUtc.toISOString() !== payload.startAtUtc) return { sent: false };
    if (booking.startAtUtc.getTime() <= jobStart.getTime()) return { sent: false };
    if (booking.silentMode) return { sent: false };
    if (!booking.provider.remindersEnabled) return { sent: false };
    if (payload.kind === "REMINDER_24H" && booking.reminder24hSentAt) return { sent: false };
    if (payload.kind === "REMINDER_2H" && booking.reminder2hSentAt) return { sent: false };

    const updated = await markReminderSent(tx, booking.id, payload.kind);
    if (!updated) return { sent: false };

    const notifications = await createBookingReminderNotifications({
      bookingId: booking.id,
      kind: payload.kind,
      db: tx,
    });

    return { sent: true, notifications, clientUserId: booking.clientUserId };
  });

  if (!result.sent) return;

  const notifications = result.notifications ?? [];
  if (notifications.length > 0) {
    publishNotifications(notifications);
    // PUSH-COVERAGE-01: пуш и письмо — строго после коммита (запись и отметка
    // «отправлено» атомарны; до коммита отправлять нельзя, ретрай джоба
    // прислал бы напоминание дважды). Ссылка — своя у каждой стороны: клиенту
    // «Мои записи», мастеру/студии — их кабинет.
    for (const record of notifications) {
      const channel = record.userId === result.clientUserId ? undefined : "MASTER";
      deliverExternalChannels(record, {
        pushUrl: resolveNotificationOpenHref(record.type, record.payloadJson, channel),
      });
    }
  }

  await sendBookingReminderTelegramNotifications(payload.bookingId, payload.kind);
}

export function isBookingReminderJob(job: { type: string }): job is { type: typeof BOOKING_REMINDER_JOB_TYPE } {
  return job.type === BOOKING_REMINDER_JOB_TYPE;
}
