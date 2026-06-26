/**
 * CLIENT-SHOWCASE-SEED-A — Showcase active client.
 *
 * Unlocks full QA of the **client cabinet** (`/cabinet/(user)/*`) by
 * giving the QA pass a real user with non-empty data on every surface:
 *
 *   • bookings page          — past + upcoming + cancelled rows
 *   • reviews page           — multiple reviews authored by this client
 *   • favorites page         — Anna Sokolova favorited (rebook chip)
 *   • notifications page     — a few personal Notifications, mix of read/unread
 *   • profile page           — first/last/display name filled, valid unique email,
 *                              phone, email NOT yet verified (so the QA can
 *                              click «Подтвердить email», see #1 bug surface
 *                              when retrying with already-occupied address)
 *   • model-applications     — one PENDING application against Anna's existing
 *                              ModelOffer (gracefully skipped if no offer found)
 *   • settings / roles / faq — work without specific data
 *
 * Identity:
 *   phone:    +79995000000 (SHOWCASE_PHONE_CLIENT — schema 100/200/300/400/500)
 *   email:    elena.petrova.91@yandex.ru  (realistic demo email — EXP-010)
 *             — caught by reset.ts via SEED_EMAIL_DOMAIN AND the new
 *             +79995 prefix in SHOWCASE_PHONE_PREFIXES.
 *   roles:    [CLIENT] only — not a master/studio.
 *
 * Pre-conditions: depends on the showcase master (Анна Соколова) having
 * been seeded already, so `index.ts` calls this AFTER `seedShowcaseMaster`.
 * If the master isn't there yet (defensive), this seed logs a warning and
 * returns early instead of throwing.
 *
 * Idempotent via `ensureUserByPhone` + deterministic booking IDs
 * (`seed-bk-showcase-client-NN`) + per-booking review upsert by bookingId.
 * Re-running walks every row back to canonical state without P2002.
 *
 * NOTE on #1 email-500 (audited, NOT fixed in this seed):
 *   This client's email is unique and not held by anyone else, so the
 *   `request-verify` flow works on the showcase client AS THE CALLER.
 *   The bug surfaces when ANY user tries to set their email to an
 *   address that's already claimed by another row (including stale
 *   released-* seed rows) — `userProfile.update({ email })` triggers
 *   the @unique constraint and Prisma throws P2002 → 500. Root cause:
 *   the route writes the new email directly into the main `email`
 *   column before verification (there is no `pendingEmail` placeholder
 *   field on the schema). Fix is a separate prompt — likely either
 *   add a `pendingEmail` column or convert the unique-collision to a
 *   user-facing 409 before the update fires.
 */

import {
  AccountType,
  BookingActionRequiredBy,
  BookingCancelledBy,
  BookingRequestedBy,
  BookingSource,
  BookingStatus,
  ModelApplicationStatus,
  NotificationType,
  ReviewTargetType,
  type Booking,
  type Provider,
  type Service,
  type UserProfile,
} from "@prisma/client";
import { logSeed } from "./helpers/log";
import { ensureUserByPhone } from "./helpers/ensure-user";
import { SHOWCASE_PHONE_CLIENT } from "./helpers/markers";
import { prisma } from "./helpers/prisma";

const PHONE = SHOWCASE_PHONE_CLIENT;
// EXP-010: realistic demo email (the seed placeholder
// `seed-client-…@test.masterryadom.local` was visible in /cabinet/profile).
// reset.ts still catches this row via the +7999 showcase phone prefix, so the
// non-test domain is safe. Unique — no other seed user holds it.
const EMAIL = "elena.petrova.91@yandex.ru";
const FIRST_NAME = "Елена";
const LAST_NAME = "Петрова";
const DISPLAY_NAME = `${FIRST_NAME} ${LAST_NAME}`;
const ANNA_USERNAME = "anna-sokolova";

function startOfDayUtc(date: Date): Date {
  const out = new Date(date);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function dateAtLocalUtc(offsetDays: number, hour: number, minute = 0, base = new Date()): Date {
  const day = startOfDayUtc(base);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  day.setUTCHours(hour, minute, 0, 0);
  return day;
}

async function ensureUser(): Promise<UserProfile> {
  return ensureUserByPhone({
    phone: PHONE,
    email: EMAIL,
    publicUsername: null,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    displayName: DISPLAY_NAME,
    roles: [AccountType.CLIENT],
  });
}

type BookingPlan = {
  index: number;
  status: BookingStatus;
  serviceName: string;
  offsetDays: number;
  hour: number;
  cancelledBy?: BookingCancelledBy;
  requestedBy?: BookingRequestedBy;
  actionRequiredBy?: BookingActionRequiredBy;
  comment?: string;
  cancelReason?: string;
};

/**
 * Bookings authored BY this client AGAINST Anna's services.
 *
 * Mix covers the surfaces the client cabinet renders:
 *   • upcoming CONFIRMED — для секции «Предстоящие»
 *   • PENDING + CHANGE_REQUESTED — для action-required cards
 *   • past FINISHED ×3 — для истории + базы под отзывы
 *   • CANCELLED (by client + by master) — для отмен-вкладки
 *   • NO_SHOW — редкий статус, проверка отображения
 */
const BOOKING_PLANS: BookingPlan[] = [
  // === Предстоящие ===
  {
    index: 1,
    status: BookingStatus.CONFIRMED,
    serviceName: "Маникюр + покрытие гель-лак",
    offsetDays: 3,
    hour: 12,
  },
  {
    index: 2,
    status: BookingStatus.PENDING,
    serviceName: "Педикюр аппаратный",
    offsetDays: 5,
    hour: 11,
    requestedBy: BookingRequestedBy.CLIENT,
    actionRequiredBy: BookingActionRequiredBy.MASTER,
  },
  {
    index: 3,
    status: BookingStatus.CHANGE_REQUESTED,
    serviceName: "Уход за бровями",
    offsetDays: 7,
    hour: 15,
    actionRequiredBy: BookingActionRequiredBy.CLIENT,
    comment: "Мастер предложил перенос на 16:00 — подтвердите, пожалуйста",
  },

  // === Прошедшие — для истории и отзывов ===
  {
    index: 4,
    status: BookingStatus.FINISHED,
    serviceName: "Маникюр классический",
    offsetDays: -7,
    hour: 14,
  },
  {
    index: 5,
    status: BookingStatus.FINISHED,
    serviceName: "Маникюр + покрытие гель-лак",
    offsetDays: -21,
    hour: 11,
  },
  {
    index: 6,
    status: BookingStatus.FINISHED,
    serviceName: "Комплекс: маникюр + педикюр",
    offsetDays: -42,
    hour: 10,
  },

  // === Отменённые ===
  {
    index: 7,
    status: BookingStatus.CANCELLED,
    serviceName: "Уход за бровями",
    offsetDays: -3,
    hour: 13,
    cancelledBy: BookingCancelledBy.CLIENT,
    cancelReason: "Заболела, переношу на следующую неделю",
  },
  {
    index: 8,
    status: BookingStatus.CANCELLED,
    serviceName: "Маникюр классический",
    offsetDays: -14,
    hour: 16,
    cancelledBy: BookingCancelledBy.PROVIDER,
    cancelReason: "Перенесли по технической причине",
  },

  // === No-show ===
  {
    index: 9,
    status: BookingStatus.NO_SHOW,
    serviceName: "Уход за бровями",
    offsetDays: -28,
    hour: 12,
  },
];

function bookingSeedId(index: number): string {
  return `seed-bk-showcase-client-${String(index).padStart(2, "0")}`;
}

function buildSlotLabel(start: Date, durationMin: number): string {
  const end = new Date(start.getTime() + durationMin * 60_000);
  const fmt = (n: number) => String(n).padStart(2, "0");
  const date = `${start.getUTCDate()}.${fmt(start.getUTCMonth() + 1)}`;
  const fromHM = `${fmt(start.getUTCHours())}:${fmt(start.getUTCMinutes())}`;
  const toHM = `${fmt(end.getUTCHours())}:${fmt(end.getUTCMinutes())}`;
  return `${date} ${fromHM}-${toHM}`;
}

async function loadAnnaProvider(): Promise<Provider | null> {
  return prisma.provider.findUnique({
    where: { publicUsername: ANNA_USERNAME },
  });
}

async function loadAnnaServices(providerId: string): Promise<Map<string, Service>> {
  const services = await prisma.service.findMany({ where: { providerId } });
  const out = new Map<string, Service>();
  for (const svc of services) out.set(svc.name, svc);
  return out;
}

async function ensureBookings(
  client: UserProfile,
  provider: Provider,
  services: Map<string, Service>,
): Promise<Booking[]> {
  const out: Booking[] = [];
  for (const plan of BOOKING_PLANS) {
    const service = services.get(plan.serviceName);
    if (!service) {
      logSeed.warn(`Showcase client: service "${plan.serviceName}" not found on Anna — skip booking #${plan.index}`);
      continue;
    }

    const startAt = dateAtLocalUtc(plan.offsetDays, plan.hour);
    const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
    const id = bookingSeedId(plan.index);
    const slotLabel = buildSlotLabel(startAt, service.durationMin);
    const cancelledAt =
      plan.status === BookingStatus.CANCELLED
        ? new Date(startAt.getTime() - 60 * 60_000)
        : null;

    const data = {
      providerId: provider.id,
      serviceId: service.id,
      masterProviderId: provider.id,
      clientUserId: client.id,
      startAtUtc: startAt,
      endAtUtc: endAt,
      slotLabel,
      clientName: DISPLAY_NAME,
      clientPhone: PHONE,
      clientNameSnapshot: DISPLAY_NAME,
      clientPhoneSnapshot: PHONE,
      status: plan.status,
      source: BookingSource.WEB,
      cancelledBy: plan.cancelledBy ?? null,
      cancelledAtUtc: cancelledAt,
      cancelReason: plan.cancelReason ?? null,
      requestedBy: plan.requestedBy ?? null,
      actionRequiredBy: plan.actionRequiredBy ?? null,
      changeComment: plan.comment ?? null,
      proposedStartAt:
        plan.status === BookingStatus.CHANGE_REQUESTED
          ? new Date(startAt.getTime() + 60 * 60_000)
          : null,
      proposedEndAt:
        plan.status === BookingStatus.CHANGE_REQUESTED
          ? new Date(startAt.getTime() + 60 * 60_000 + service.durationMin * 60_000)
          : null,
    };

    const booking = await prisma.booking.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    out.push(booking);
  }
  return out;
}

type ReviewPlan = {
  bookingIndex: number;
  rating: number;
  text: string;
  replyText?: string;
};

const REVIEW_PLANS: ReviewPlan[] = [
  {
    bookingIndex: 4,
    rating: 5,
    text: "Очень довольна! Маникюр держится больше двух недель без сколов. Анна — настоящий профи, всё аккуратно и быстро.",
    replyText: "Спасибо большое за тёплые слова! Будем ждать вас снова.",
  },
  {
    bookingIndex: 5,
    rating: 5,
    text: "Записалась повторно — снова идеально. Атмосфера спокойная, мастер внимательный, кофе с печеньем — приятный бонус.",
    replyText: "Благодарим! До встречи в следующий раз.",
  },
  {
    bookingIndex: 6,
    rating: 4,
    text: "Делала комплекс — результатом довольна. Чуть дольше по времени, чем ожидала, но это потому что мастер не торопится и работает качественно.",
    // No reply — для проверки «без ответа» отображения
  },
];

async function ensureReviews(bookings: Booking[], client: UserProfile, providerId: string): Promise<number> {
  let count = 0;
  for (let i = 0; i < REVIEW_PLANS.length; i += 1) {
    const plan = REVIEW_PLANS[i]!;
    const id = bookingSeedId(plan.bookingIndex);
    const booking = bookings.find((b) => b.id === id);
    if (!booking || booking.status !== BookingStatus.FINISHED) continue;

    // EXP-007: keep this client's reviews OLDER than the showcase master's
    // own reviews so Anna's public-profile preview (3 newest, createdAt desc)
    // shows three distinct authors instead of Елена Петрова repeated.
    const reviewCreatedAt = new Date(Date.now() - (i + 10) * 24 * 60 * 60_000);

    await prisma.review.upsert({
      where: { bookingId: booking.id },
      update: {
        rating: plan.rating,
        text: plan.text,
        replyText: plan.replyText ?? null,
        repliedAt: plan.replyText ? new Date() : null,
        createdAt: reviewCreatedAt,
      },
      create: {
        bookingId: booking.id,
        authorId: client.id,
        targetType: ReviewTargetType.provider,
        targetId: providerId,
        masterId: providerId,
        rating: plan.rating,
        text: plan.text,
        replyText: plan.replyText ?? null,
        repliedAt: plan.replyText ? new Date() : null,
        createdAt: reviewCreatedAt,
      },
    });
    count += 1;
  }
  return count;
}

async function ensureFavorite(clientUserId: string, providerId: string): Promise<void> {
  // Upsert by composite unique (userId, providerId) — schema defines this
  // pair as the natural key. Failing fast on absence is OK; the favorites
  // surface tolerates an empty list, this is just a nicety so the user
  // sees a favourited Anna for «возможная повторная запись» flow.
  await prisma.userFavorite
    .upsert({
      where: { userId_providerId: { userId: clientUserId, providerId } },
      update: {},
      create: { userId: clientUserId, providerId },
    })
    .catch(() => {
      // If the unique composite name differs in schema, skip silently —
      // favorites are nice-to-have, not blocking for QA.
    });
}

type NotificationPlan = {
  index: number;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  ageHours: number;
  bookingIndex?: number;
};

const NOTIFICATION_PLANS: NotificationPlan[] = [
  {
    index: 1,
    type: NotificationType.BOOKING_CONFIRMED,
    title: "Запись подтверждена",
    body: "Анна Соколова подтвердила вашу запись на маникюр + покрытие гель-лак",
    isRead: false,
    ageHours: 2,
    bookingIndex: 1,
  },
  {
    index: 2,
    type: NotificationType.BOOKING_RESCHEDULE_REQUESTED,
    title: "Мастер предложил перенос",
    body: "Анна предложила перенести запись на бровях на час позже",
    isRead: false,
    ageHours: 6,
    bookingIndex: 3,
  },
  {
    index: 3,
    type: NotificationType.BOOKING_REMINDER_2H,
    title: "Запись через 2 часа",
    body: "Не забудьте: маникюр + покрытие гель-лак в 12:00 у Анны Соколовой",
    isRead: false,
    ageHours: 1,
    bookingIndex: 1,
  },
  {
    index: 4,
    type: NotificationType.REVIEW_REPLIED,
    title: "Мастер ответил на отзыв",
    body: "Анна ответила на ваш отзыв — посмотрите, что она написала",
    isRead: true,
    ageHours: 48,
    bookingIndex: 5,
  },
  {
    index: 5,
    type: NotificationType.BOOKING_CANCELLED_BY_MASTER,
    title: "Запись отменена мастером",
    body: "Анна отменила запись на маникюр от 14-го числа — выберите новое время",
    isRead: true,
    ageHours: 24 * 14,
    bookingIndex: 8,
  },
];

function notificationSeedId(index: number): string {
  return `seed-notif-showcase-client-${String(index).padStart(2, "0")}`;
}

async function ensureNotifications(clientUserId: string, bookings: Booking[]): Promise<number> {
  let count = 0;
  for (const plan of NOTIFICATION_PLANS) {
    const id = notificationSeedId(plan.index);
    const bookingId = plan.bookingIndex
      ? bookings.find((b) => b.id === bookingSeedId(plan.bookingIndex!))?.id ?? null
      : null;
    const createdAt = new Date(Date.now() - plan.ageHours * 60 * 60 * 1000);
    const readAt = plan.isRead ? new Date(createdAt.getTime() + 30 * 60 * 1000) : null;

    const data = {
      userId: clientUserId,
      type: plan.type,
      title: plan.title,
      body: plan.body,
      payloadJson: bookingId ? { bookingId } : {},
      isRead: plan.isRead,
      bookingId,
      readAt,
      createdAt,
    };

    await prisma.notification.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    count += 1;
  }
  return count;
}

async function ensureModelApplication(clientUserId: string, masterProviderId: string): Promise<boolean> {
  const offer = await prisma.modelOffer.findFirst({
    where: { masterId: masterProviderId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!offer) return false;

  await prisma.modelApplication.upsert({
    where: {
      offerId_clientUserId: { offerId: offer.id, clientUserId },
    },
    update: {
      status: ModelApplicationStatus.PENDING,
      clientNote: "Готова попробовать новую технику!",
      consentToShoot: true,
    },
    create: {
      offerId: offer.id,
      clientUserId,
      status: ModelApplicationStatus.PENDING,
      clientNote: "Готова попробовать новую технику!",
      consentToShoot: true,
    },
  });
  return true;
}

export async function seedShowcaseClient(): Promise<UserProfile | null> {
  logSeed.section("Showcase client");

  const anna = await loadAnnaProvider();
  if (!anna) {
    logSeed.warn(
      "Showcase master (Анна Соколова) не найдена — пропускаю showcase client. Запустите seed в правильном порядке (master перед client).",
    );
    return null;
  }

  const services = await loadAnnaServices(anna.id);
  if (services.size === 0) {
    logSeed.warn("У Анны нет услуг в БД — пропускаю showcase client.");
    return null;
  }

  const client = await ensureUser();
  const bookings = await ensureBookings(client, anna, services);
  const reviewCount = await ensureReviews(bookings, client, anna.id);
  await ensureFavorite(client.id, anna.id);
  const notifCount = await ensureNotifications(client.id, bookings);
  const hasApplication = await ensureModelApplication(client.id, anna.id);

  logSeed.ok(
    `Готово. Login: phone ${PHONE} → /cabinet (CLIENT). Bookings: ${bookings.length}, ` +
      `reviews: ${reviewCount}, notifications: ${notifCount}` +
      (hasApplication ? ", model application: 1 PENDING" : ""),
  );
  return client;
}
