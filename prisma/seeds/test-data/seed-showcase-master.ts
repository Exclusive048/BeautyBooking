/**
 * Showcase master — single rich profile used to validate every cabinet
 * surface end-to-end (dashboard, bookings kanban, schedule week view, all
 * 5 settings tabs, notifications, reviews).
 *
 * Identity:
 *   phone:    +79991000009  (memorable demo number, intentionally outside
 *                            the +7900000XXXX seed range)
 *   email:    seed-master-anna-sokolova@test.masterryadom.local
 *             — keeps the row inside `reset.ts`'s reach via the
 *             SEED_EMAIL_DOMAIN match (reset uses email OR phone).
 *   username: anna-sokolova
 *
 * The module is fully idempotent: every entity uses upsert with stable
 * unique keys (publicUsername / deterministic IDs / composite uniques),
 * so re-running the seed walks the existing rows back into the canonical
 * state instead of duplicating.
 *
 * Data shape is deliberately the maximum the cabinet can represent:
 *   - 5 services, single FLEXIBLE schedule with lunch break
 *   - 3 schedule overrides (multi-day OFF, single TIME_RANGE, vacation)
 *   - DiscountRule enabled + 2 active hot slots
 *   - 22 bookings spread across all 11 BookingStatus values
 *   - 6 reviews, 2 unanswered
 *   - 12 notifications across 10 NotificationType values, 5 unread
 *   - 1 PushSubscription so the Push KPI lands in the "Включены" state
 *   - 3 ClientCards seeded for the future CRM redesign
 *
 * Dates are computed relative to NOW so the upcoming/past split always
 * looks fresh — re-running tomorrow rolls every offset forward.
 */

import {
  AccountType,
  BookingActionRequiredBy,
  BookingCancelledBy,
  BookingRequestedBy,
  BookingSource,
  BookingStatus,
  DiscountApplyMode,
  DiscountType,
  ModelApplicationStatus,
  ModelOfferStatus,
  NotificationType,
  PlanTier,
  Prisma,
  ProviderType,
  ReviewTargetType,
  ScheduleMode,
  ScheduleOverrideKind,
  SubscriptionScope,
  SubscriptionStatus,
  type BillingPlan,
  type Booking,
  type Service,
  type UserProfile,
} from "@prisma/client";
import { logSeed } from "./helpers/log";
import { seedEmail } from "./helpers/markers";
import { prisma } from "./helpers/prisma";

const PHONE = "+79991000009";
const EMAIL = seedEmail("master", "anna-sokolova");
const PUBLIC_USERNAME = "anna-sokolova";
const FIRST_NAME = "Анна";
const LAST_NAME = "Соколова";
const DISPLAY_NAME = `${FIRST_NAME} ${LAST_NAME}`;

const TEMPLATE_WEEKDAY = "showcase-anna-weekday";
const TEMPLATE_SATURDAY = "showcase-anna-saturday";

const DAY_MS = 24 * 60 * 60 * 1000;

type Input = {
  clients: UserProfile[];
  plans: BillingPlan[];
};

type ServiceSeed = {
  key: string;
  name: string;
  durationMin: number;
  price: number;
};

const SERVICE_DEFS: ServiceSeed[] = [
  { key: "manicure", name: "Маникюр классический", durationMin: 60, price: 250000 },
  { key: "manicure-gel", name: "Маникюр + покрытие гель-лак", durationMin: 90, price: 400000 },
  { key: "pedicure", name: "Педикюр аппаратный", durationMin: 90, price: 450000 },
  { key: "brows", name: "Уход за бровями", durationMin: 45, price: 200000 },
  { key: "combo", name: "Комплекс: маникюр + педикюр", durationMin: 180, price: 800000 },
];

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

function dateAtMidnight(offsetDays: number, base = new Date()): Date {
  const day = startOfDayUtc(base);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day;
}

function findPlan(plans: BillingPlan[], code: string): BillingPlan {
  const match = plans.find((p) => p.code === code);
  if (!match) throw new Error(`seed-showcase-master: missing plan code=${code}`);
  return match;
}

async function ensureUser(): Promise<UserProfile> {
  return prisma.userProfile.upsert({
    where: { email: EMAIL },
    update: {
      phone: PHONE,
      firstName: FIRST_NAME,
      lastName: LAST_NAME,
      displayName: DISPLAY_NAME,
      publicUsername: PUBLIC_USERNAME,
      roles: [AccountType.CLIENT, AccountType.MASTER],
    },
    create: {
      email: EMAIL,
      phone: PHONE,
      firstName: FIRST_NAME,
      lastName: LAST_NAME,
      displayName: DISPLAY_NAME,
      publicUsername: PUBLIC_USERNAME,
      roles: [AccountType.CLIENT, AccountType.MASTER],
    },
  });
}

async function ensureProvider(userId: string) {
  const cityRow = await prisma.city.findFirst({
    where: { OR: [{ slug: "almaty" }, { name: "Алматы" }] },
    select: { id: true },
  });

  return prisma.provider.upsert({
    where: { publicUsername: PUBLIC_USERNAME },
    update: {
      ownerUserId: userId,
      name: DISPLAY_NAME,
      tagline: "Маникюр · педикюр · брови",
      description:
        "Мастер маникюра, педикюра и ухода за бровями. 8 лет опыта, индивидуальный подход без давления.",
      address: "ул. Достык, 89",
      district: "Медеуский район",
      cityId: cityRow?.id ?? null,
      timezone: "Asia/Almaty",
      isPublished: true,
      categories: ["nails", "brows"],
      rating: 4.9,
      ratingAvg: 4.9,
      ratingCount: 47,
      reviews: 47,
      priceFrom: 200000,
      scheduleMode: ScheduleMode.FLEXIBLE,
      slotStepMin: 30,
      bufferBetweenBookingsMin: 15,
      minBookingHoursAhead: 2,
      maxBookingDaysAhead: 60,
      autoConfirmBookings: false,
      cancellationDeadlineHours: 4,
      lateCancelAction: "reminder",
      slotPrecision: "exact",
      visibleSlotDays: 30,
      acceptNewClients: true,
    },
    create: {
      ownerUserId: userId,
      type: ProviderType.MASTER,
      name: DISPLAY_NAME,
      tagline: "Маникюр · педикюр · брови",
      description:
        "Мастер маникюра, педикюра и ухода за бровями. 8 лет опыта, индивидуальный подход без давления.",
      publicUsername: PUBLIC_USERNAME,
      address: "ул. Достык, 89",
      district: "Медеуский район",
      cityId: cityRow?.id ?? null,
      timezone: "Asia/Almaty",
      isPublished: true,
      categories: ["nails", "brows"],
      rating: 4.9,
      ratingAvg: 4.9,
      ratingCount: 47,
      reviews: 47,
      priceFrom: 200000,
      scheduleMode: ScheduleMode.FLEXIBLE,
      slotStepMin: 30,
      bufferBetweenBookingsMin: 15,
      minBookingHoursAhead: 2,
      maxBookingDaysAhead: 60,
      autoConfirmBookings: false,
      cancellationDeadlineHours: 4,
      lateCancelAction: "reminder",
      slotPrecision: "exact",
      visibleSlotDays: 30,
      acceptNewClients: true,
    },
  });
}

async function ensureMasterProfile(userId: string, providerId: string) {
  return prisma.masterProfile.upsert({
    where: { providerId },
    update: { userId },
    create: { userId, providerId },
  });
}

async function ensureSubscription(userId: string, planId: string) {
  return prisma.userSubscription.upsert({
    where: { userId_scope: { userId, scope: SubscriptionScope.MASTER } },
    update: {
      planId,
      status: SubscriptionStatus.ACTIVE,
      isTrial: false,
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
      autoRenew: true,
    },
    create: {
      userId,
      scope: SubscriptionScope.MASTER,
      planId,
      status: SubscriptionStatus.ACTIVE,
      isTrial: false,
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
      autoRenew: true,
    },
  });
}

async function ensureServices(providerId: string): Promise<Map<string, Service>> {
  const out = new Map<string, Service>();
  for (const def of SERVICE_DEFS) {
    const existing = await prisma.service.findFirst({
      where: { providerId, name: def.name },
      select: { id: true },
    });
    if (existing) {
      const updated = await prisma.service.update({
        where: { id: existing.id },
        data: {
          durationMin: def.durationMin,
          price: def.price,
          isEnabled: true,
          isActive: true,
        },
      });
      out.set(def.key, updated);
    } else {
      const created = await prisma.service.create({
        data: {
          providerId,
          name: def.name,
          durationMin: def.durationMin,
          price: def.price,
          isEnabled: true,
          isActive: true,
        },
      });
      out.set(def.key, created);
    }
  }
  return out;
}

async function ensureSchedule(providerId: string) {
  // Two auto-templates: weekday 10:00-20:00 with lunch 13:00-14:00,
  // saturday 10:00-18:00 without lunch.
  const weekday = await prisma.scheduleTemplate.upsert({
    where: { providerId_name: { providerId, name: TEMPLATE_WEEKDAY } },
    update: { startLocal: "10:00", endLocal: "20:00", color: null },
    create: {
      providerId,
      name: TEMPLATE_WEEKDAY,
      startLocal: "10:00",
      endLocal: "20:00",
    },
  });
  await prisma.scheduleTemplateBreak.deleteMany({ where: { templateId: weekday.id } });
  await prisma.scheduleTemplateBreak.create({
    data: {
      templateId: weekday.id,
      startLocal: "13:00",
      endLocal: "14:00",
      sortOrder: 0,
      title: "Обед",
    },
  });

  const saturday = await prisma.scheduleTemplate.upsert({
    where: { providerId_name: { providerId, name: TEMPLATE_SATURDAY } },
    update: { startLocal: "10:00", endLocal: "18:00", color: null },
    create: {
      providerId,
      name: TEMPLATE_SATURDAY,
      startLocal: "10:00",
      endLocal: "18:00",
    },
  });
  await prisma.scheduleTemplateBreak.deleteMany({ where: { templateId: saturday.id } });

  const config = await prisma.weeklyScheduleConfig.upsert({
    where: { providerId },
    update: {},
    create: { providerId },
  });

  // engine convention: weekday 1=Mon..6=Sat, 7=Sun
  const days: Array<{ weekday: number; isActive: boolean; templateId: string | null }> = [
    { weekday: 1, isActive: true, templateId: weekday.id },
    { weekday: 2, isActive: true, templateId: weekday.id },
    { weekday: 3, isActive: true, templateId: weekday.id },
    { weekday: 4, isActive: true, templateId: weekday.id },
    { weekday: 5, isActive: true, templateId: weekday.id },
    { weekday: 6, isActive: true, templateId: saturday.id },
    { weekday: 7, isActive: false, templateId: null },
  ];

  for (const day of days) {
    await prisma.weeklyScheduleDay.upsert({
      where: { configId_weekday: { configId: config.id, weekday: day.weekday } },
      update: {
        isActive: day.isActive,
        templateId: day.templateId,
        scheduleMode: ScheduleMode.FLEXIBLE,
      },
      create: {
        configId: config.id,
        weekday: day.weekday,
        isActive: day.isActive,
        templateId: day.templateId,
        scheduleMode: ScheduleMode.FLEXIBLE,
      },
    });
  }
}

async function ensureExceptions(providerId: string) {
  // Wipe previous showcase overrides + their override-breaks so reruns
  // don't pile up (legacy from earlier seeding cycles).
  const existingDates = new Set<number>();
  // Майские праздники +7..+9, Сокр.день +14, Отпуск Сочи +30..+36
  const offsets = [7, 8, 9, 14, 30, 31, 32, 33, 34, 35, 36];
  for (const offset of offsets) {
    existingDates.add(dateAtMidnight(offset).getTime());
  }

  const existing = await prisma.scheduleOverride.findMany({
    where: { providerId },
    select: { id: true, date: true },
  });
  for (const row of existing) {
    if (existingDates.has(row.date.getTime())) {
      await prisma.scheduleOverride.delete({ where: { id: row.id } }).catch(() => null);
    }
  }

  // Майские праздники — 3 OFF rows
  for (const offset of [7, 8, 9]) {
    await prisma.scheduleOverride.create({
      data: {
        providerId,
        date: dateAtMidnight(offset),
        kind: ScheduleOverrideKind.OFF,
        isDayOff: true,
        isWorkday: false,
        scheduleMode: ScheduleMode.FLEXIBLE,
        note: "Майские праздники",
      },
    });
  }

  // Сокращённый день — 1 TIME_RANGE row
  await prisma.scheduleOverride.create({
    data: {
      providerId,
      date: dateAtMidnight(14),
      kind: ScheduleOverrideKind.TIME_RANGE,
      isDayOff: false,
      isWorkday: true,
      scheduleMode: ScheduleMode.FLEXIBLE,
      startLocal: "10:00",
      endLocal: "14:00",
      note: "Сокращённый день",
    },
  });

  // Отпуск Сочи — 7 OFF rows
  for (let offset = 30; offset <= 36; offset += 1) {
    await prisma.scheduleOverride.create({
      data: {
        providerId,
        date: dateAtMidnight(offset),
        kind: ScheduleOverrideKind.OFF,
        isDayOff: true,
        isWorkday: false,
        scheduleMode: ScheduleMode.FLEXIBLE,
        note: "Отпуск · Сочи",
      },
    });
  }
}

async function ensureHotSlots(providerId: string, services: Map<string, Service>) {
  await prisma.discountRule.upsert({
    where: { providerId },
    update: {
      isEnabled: true,
      smartPriceEnabled: false,
      triggerHours: 3,
      discountType: DiscountType.PERCENT,
      discountValue: 20,
      applyMode: DiscountApplyMode.ALL_SERVICES,
      minPriceFrom: null,
      serviceIds: [],
    },
    create: {
      providerId,
      isEnabled: true,
      smartPriceEnabled: false,
      triggerHours: 3,
      discountType: DiscountType.PERCENT,
      discountValue: 20,
      applyMode: DiscountApplyMode.ALL_SERVICES,
      minPriceFrom: null,
      serviceIds: [],
    },
  });

  // Two upcoming hot slots — today evening + tomorrow afternoon.
  const slots = [
    { offsetDays: 0, hour: 19, durationHr: 1, expiresOffsetHr: -0.5 },
    { offsetDays: 1, hour: 15, durationHr: 1, expiresOffsetHr: -3 },
  ];
  for (const slot of slots) {
    const startAt = dateAtLocalUtc(slot.offsetDays, slot.hour);
    const endAt = new Date(startAt.getTime() + slot.durationHr * 60 * 60 * 1000);
    const expiresAt = new Date(startAt.getTime() + slot.expiresOffsetHr * 60 * 60 * 1000);
    const manicure = services.get("manicure");
    await prisma.hotSlot.upsert({
      where: { providerId_startAtUtc_endAtUtc: { providerId, startAtUtc: startAt, endAtUtc: endAt } },
      update: {
        discountType: DiscountType.PERCENT,
        discountValue: 20,
        isActive: true,
        isAuto: false,
        expiresAtUtc: expiresAt,
        serviceId: manicure?.id ?? null,
        reason: "Showcase: горячее окошко",
      },
      create: {
        providerId,
        serviceId: manicure?.id ?? null,
        startAtUtc: startAt,
        endAtUtc: endAt,
        discountType: DiscountType.PERCENT,
        discountValue: 20,
        isActive: true,
        isAuto: false,
        expiresAtUtc: expiresAt,
        reason: "Showcase: горячее окошко",
      },
    });
  }
}

type BookingPlan = {
  index: number;
  status: BookingStatus;
  clientIndex: number;
  serviceKey: string;
  offsetDays: number;
  hour: number;
  minute?: number;
  cancelledBy?: BookingCancelledBy;
  requestedBy?: BookingRequestedBy;
  actionRequiredBy?: BookingActionRequiredBy;
  comment?: string;
};

/**
 * 22 bookings — distribution per the plan. Picking deterministic client
 * indexes lets one client (index 0) accumulate three FINISHED rows so
 * the future CRM view has a "regular" client to highlight.
 */
const BOOKING_PLANS: BookingPlan[] = [
  // 3 PENDING (action required)
  { index: 1, status: BookingStatus.PENDING, clientIndex: 0, serviceKey: "manicure-gel", offsetDays: 1, hour: 11, actionRequiredBy: BookingActionRequiredBy.MASTER, requestedBy: BookingRequestedBy.CLIENT },
  { index: 2, status: BookingStatus.PENDING, clientIndex: 1, serviceKey: "pedicure", offsetDays: 1, hour: 14, actionRequiredBy: BookingActionRequiredBy.MASTER, requestedBy: BookingRequestedBy.CLIENT },
  { index: 3, status: BookingStatus.PENDING, clientIndex: 2, serviceKey: "combo", offsetDays: 2, hour: 10, actionRequiredBy: BookingActionRequiredBy.MASTER, requestedBy: BookingRequestedBy.CLIENT },
  // 1 CHANGE_REQUESTED
  { index: 4, status: BookingStatus.CHANGE_REQUESTED, clientIndex: 3, serviceKey: "manicure-gel", offsetDays: 2, hour: 15, actionRequiredBy: BookingActionRequiredBy.MASTER, comment: "Можно перенести на час раньше?" },
  // 8 CONFIRMED
  { index: 5, status: BookingStatus.CONFIRMED, clientIndex: 4, serviceKey: "brows", offsetDays: 0, hour: 16 },
  { index: 6, status: BookingStatus.CONFIRMED, clientIndex: 5, serviceKey: "manicure", offsetDays: 0, hour: 18 },
  { index: 7, status: BookingStatus.CONFIRMED, clientIndex: 6, serviceKey: "pedicure", offsetDays: 1, hour: 16 },
  { index: 8, status: BookingStatus.CONFIRMED, clientIndex: 7, serviceKey: "manicure", offsetDays: 2, hour: 11 },
  { index: 9, status: BookingStatus.CONFIRMED, clientIndex: 8, serviceKey: "manicure-gel", offsetDays: 3, hour: 14 },
  { index: 10, status: BookingStatus.CONFIRMED, clientIndex: 9, serviceKey: "brows", offsetDays: 4, hour: 12 },
  { index: 11, status: BookingStatus.CONFIRMED, clientIndex: 10, serviceKey: "combo", offsetDays: 5, hour: 10 },
  { index: 12, status: BookingStatus.CONFIRMED, clientIndex: 11, serviceKey: "pedicure", offsetDays: 6, hour: 15 },
  // 1 STARTED — running right now (~30 min into a 60-min slot)
  { index: 13, status: BookingStatus.STARTED, clientIndex: 12, serviceKey: "manicure", offsetDays: 0, hour: 12 },
  // 6 FINISHED (client 0 gets 3 → repeat-client for CRM)
  { index: 14, status: BookingStatus.FINISHED, clientIndex: 0, serviceKey: "manicure", offsetDays: -3, hour: 15 },
  { index: 15, status: BookingStatus.FINISHED, clientIndex: 0, serviceKey: "brows", offsetDays: -10, hour: 11 },
  { index: 16, status: BookingStatus.FINISHED, clientIndex: 0, serviceKey: "pedicure", offsetDays: -21, hour: 16 },
  { index: 17, status: BookingStatus.FINISHED, clientIndex: 13, serviceKey: "manicure-gel", offsetDays: -5, hour: 14 },
  { index: 18, status: BookingStatus.FINISHED, clientIndex: 14, serviceKey: "combo", offsetDays: -7, hour: 10 },
  { index: 19, status: BookingStatus.FINISHED, clientIndex: 1, serviceKey: "brows", offsetDays: -14, hour: 17 },
  // 2 CANCELLED (one by client, one by provider)
  { index: 20, status: BookingStatus.CANCELLED, clientIndex: 13, serviceKey: "brows", offsetDays: -1, hour: 14, cancelledBy: BookingCancelledBy.CLIENT },
  { index: 21, status: BookingStatus.CANCELLED, clientIndex: 14, serviceKey: "pedicure", offsetDays: 0, hour: 9, cancelledBy: BookingCancelledBy.PROVIDER },
  // 1 NO_SHOW
  { index: 22, status: BookingStatus.NO_SHOW, clientIndex: 4, serviceKey: "manicure", offsetDays: -2, hour: 11 },
  // 1 REJECTED
  { index: 23, status: BookingStatus.REJECTED, clientIndex: 5, serviceKey: "manicure", offsetDays: 1, hour: 10 },
];

function buildSlotLabel(start: Date, durationMin: number): string {
  const end = new Date(start.getTime() + durationMin * 60_000);
  const fmt = (n: number) => String(n).padStart(2, "0");
  const date = `${start.getUTCDate()}.${fmt(start.getUTCMonth() + 1)}`;
  const fromHM = `${fmt(start.getUTCHours())}:${fmt(start.getUTCMinutes())}`;
  const toHM = `${fmt(end.getUTCHours())}:${fmt(end.getUTCMinutes())}`;
  return `${date} ${fromHM}-${toHM}`;
}

function bookingSeedId(index: number): string {
  return `seed-bk-showcase-anna-${String(index).padStart(2, "0")}`;
}

async function ensureBookings(input: {
  providerId: string;
  clients: UserProfile[];
  services: Map<string, Service>;
}): Promise<Booking[]> {
  const out: Booking[] = [];
  for (const plan of BOOKING_PLANS) {
    const client = input.clients[plan.clientIndex % input.clients.length];
    const service = input.services.get(plan.serviceKey);
    if (!client || !service) continue;

    let baseStart = dateAtLocalUtc(plan.offsetDays, plan.hour, plan.minute ?? 0);
    if (plan.status === BookingStatus.STARTED) {
      // Pin STARTED slot to "now - 30 min" so it always reads as in-progress.
      baseStart = new Date(Date.now() - 30 * 60_000);
    }
    const endAt = new Date(baseStart.getTime() + service.durationMin * 60_000);
    const id = bookingSeedId(plan.index);
    const slotLabel = buildSlotLabel(baseStart, service.durationMin);
    const cancelledAt =
      plan.status === BookingStatus.CANCELLED || plan.status === BookingStatus.REJECTED
        ? new Date(baseStart.getTime() - 60 * 60_000)
        : null;

    const data = {
      providerId: input.providerId,
      serviceId: service.id,
      masterProviderId: input.providerId,
      clientUserId: client.id,
      startAtUtc: baseStart,
      endAtUtc: endAt,
      slotLabel,
      clientName:
        client.displayName ??
        (`${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Клиент"),
      clientPhone: client.phone ?? "",
      clientNameSnapshot: client.displayName ?? null,
      clientPhoneSnapshot: client.phone ?? null,
      status: plan.status,
      source: BookingSource.WEB,
      cancelledBy: plan.cancelledBy ?? null,
      cancelledAtUtc: cancelledAt,
      cancelReason:
        plan.status === BookingStatus.CANCELLED && plan.cancelledBy === BookingCancelledBy.CLIENT
          ? "Заболела, переношу на следующую неделю"
          : plan.status === BookingStatus.CANCELLED && plan.cancelledBy === BookingCancelledBy.PROVIDER
            ? "Перенесли по технической причине"
            : null,
      requestedBy: plan.requestedBy ?? null,
      actionRequiredBy: plan.actionRequiredBy ?? null,
      changeComment: plan.comment ?? null,
      proposedStartAt: plan.status === BookingStatus.CHANGE_REQUESTED ? new Date(baseStart.getTime() - 60 * 60_000) : null,
      proposedEndAt: plan.status === BookingStatus.CHANGE_REQUESTED ? new Date(baseStart.getTime() - 60 * 60_000 + service.durationMin * 60_000) : null,
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

async function ensureReviews(args: {
  providerId: string;
  bookings: Booking[];
}): Promise<{ unanswered: number; reviews: Array<{ id: string; bookingId: string; authorId: string }> }> {
  const finished = args.bookings.filter((b) => b.status === BookingStatus.FINISHED);
  const reviewTexts = [
    "Аня — золотые руки. Покрытие держится больше трёх недель, никаких сколов.",
    "СПА-педикюр прошёл идеально. Кожа после — как у младенца.",
    "Очень внимательный мастер. Учла все мои пожелания, ничего не навязывала.",
    "Чисто, аккуратно, по времени. Из салона ухожу всегда в хорошем настроении.",
    "Брови сделаны в точку — естественно, без перебора.",
    "Комплекс маникюр + педикюр — мой must have. Уже четвёртый раз прихожу.",
  ];
  const replies = [
    "Спасибо за тёплые слова! Жду в следующий раз.",
    "Очень приятно слышать. До скорой встречи!",
    "Благодарю, мне тоже было приятно работать.",
    "Всегда рада видеть. Заходите в любое время.",
  ];

  const out: Array<{ id: string; bookingId: string; authorId: string }> = [];
  let unanswered = 0;

  for (let i = 0; i < Math.min(6, finished.length); i += 1) {
    const booking = finished[i];
    if (!booking.clientUserId) continue;
    const withReply = i < 4;
    const review = await prisma.review.upsert({
      where: { bookingId: booking.id },
      update: {
        authorId: booking.clientUserId,
        targetType: ReviewTargetType.provider,
        targetId: args.providerId,
        masterId: args.providerId,
        rating: i === 5 ? 4 : 5,
        text: reviewTexts[i % reviewTexts.length] ?? "",
        replyText: withReply ? (replies[i % replies.length] ?? null) : null,
        repliedAt: withReply ? new Date(Date.now() - (i + 1) * DAY_MS) : null,
      },
      create: {
        bookingId: booking.id,
        authorId: booking.clientUserId,
        targetType: ReviewTargetType.provider,
        targetId: args.providerId,
        masterId: args.providerId,
        rating: i === 5 ? 4 : 5,
        text: reviewTexts[i % reviewTexts.length] ?? "",
        replyText: withReply ? (replies[i % replies.length] ?? null) : null,
        repliedAt: withReply ? new Date(Date.now() - (i + 1) * DAY_MS) : null,
      },
    });
    if (!withReply) unanswered += 1;
    out.push({ id: review.id, bookingId: booking.id, authorId: booking.clientUserId });
  }
  return { unanswered, reviews: out };
}

async function ensureNotifications(args: {
  userId: string;
  bookings: Booking[];
  reviews: Array<{ id: string; bookingId: string; authorId: string }>;
  clients: UserProfile[];
}) {
  // Wipe everything previously seeded for this user so we don't get
  // duplicates on rerun. Notification has no natural unique key beyond id.
  await prisma.notification.deleteMany({ where: { userId: args.userId } });

  const byStatus = (status: BookingStatus) => args.bookings.filter((b) => b.status === status);
  const pending = byStatus(BookingStatus.PENDING);
  const changeRequested = byStatus(BookingStatus.CHANGE_REQUESTED)[0] ?? null;
  const cancelledByClient = args.bookings.find(
    (b) => b.status === BookingStatus.CANCELLED && b.cancelledBy === BookingCancelledBy.CLIENT
  );
  const todayConfirmed = args.bookings.find(
    (b) =>
      b.status === BookingStatus.CONFIRMED &&
      b.startAtUtc &&
      b.startAtUtc.getTime() - Date.now() < 6 * 60 * 60_000 &&
      b.startAtUtc.getTime() > Date.now()
  );
  const tomorrowConfirmed = args.bookings.find(
    (b) =>
      b.status === BookingStatus.CONFIRMED &&
      b.startAtUtc &&
      b.startAtUtc.getTime() - Date.now() > 12 * 60 * 60_000
  );

  const reviewsUnanswered = args.reviews.slice(4); // 2 unanswered (indexes 4, 5)
  const reviewAnswered = args.reviews[0];

  type Plan = {
    type: NotificationType;
    title: string;
    body: string;
    payload: Prisma.InputJsonValue;
    bookingId?: string | null;
    isRead: boolean;
    /** offset from now in minutes — negative = older */
    createdAtMinutesAgo: number;
  };

  const plans: Plan[] = [];

  // BOOKING_REQUEST × 3 — all unread, latest first
  pending.forEach((booking, idx) => {
    plans.push({
      type: NotificationType.BOOKING_REQUEST,
      title: `Новая запись: ${booking.clientName}`,
      body: `${buildSlotLabel(booking.startAtUtc ?? new Date(), 60)} · ожидает подтверждения`,
      payload: buildBookingPayload(booking),
      bookingId: booking.id,
      isRead: false,
      createdAtMinutesAgo: 5 + idx * 25,
    });
  });

  // BOOKING_RESCHEDULE_REQUESTED × 1 — unread
  if (changeRequested) {
    plans.push({
      type: NotificationType.BOOKING_RESCHEDULE_REQUESTED,
      title: `${changeRequested.clientName}: можно перенести запись?`,
      body: changeRequested.changeComment ?? "Клиент запросил перенос времени.",
      payload: buildBookingPayload(changeRequested),
      bookingId: changeRequested.id,
      isRead: false,
      createdAtMinutesAgo: 90,
    });
  }

  // BOOKING_REMINDER_2H × 1 — unread (today CONFIRMED)
  if (todayConfirmed) {
    plans.push({
      type: NotificationType.BOOKING_REMINDER_2H,
      title: `Скоро запись: ${todayConfirmed.clientName}`,
      body: `Через 2 часа · ${buildSlotLabel(todayConfirmed.startAtUtc ?? new Date(), 60)}`,
      payload: buildBookingPayload(todayConfirmed),
      bookingId: todayConfirmed.id,
      isRead: false,
      createdAtMinutesAgo: 30,
    });
  }

  // REVIEW_LEFT × 1 — unread (latest unanswered)
  if (reviewsUnanswered[0]) {
    const review = reviewsUnanswered[0];
    plans.push({
      type: NotificationType.REVIEW_LEFT,
      title: "Новый отзыв · 5★",
      body: "«Очень внимательный мастер. Учла все пожелания.»",
      payload: {
        reviewId: review.id,
        bookingId: review.bookingId,
        authorId: review.authorId,
        rating: 5,
      } as Prisma.InputJsonValue,
      bookingId: review.bookingId,
      isRead: false,
      createdAtMinutesAgo: 360,
    });
  }

  // BOOKING_CANCELLED_BY_CLIENT × 1 — read
  if (cancelledByClient) {
    plans.push({
      type: NotificationType.BOOKING_CANCELLED_BY_CLIENT,
      title: `${cancelledByClient.clientName} отменила запись`,
      body: cancelledByClient.cancelReason ?? "Без указания причины.",
      payload: buildBookingPayload(cancelledByClient),
      bookingId: cancelledByClient.id,
      isRead: true,
      createdAtMinutesAgo: 60 * 24, // yesterday
    });
  }

  // BOOKING_RESCHEDULED × 1 — read
  if (tomorrowConfirmed) {
    plans.push({
      type: NotificationType.BOOKING_RESCHEDULED,
      title: `${tomorrowConfirmed.clientName} перенесла запись`,
      body: `Новое время: ${buildSlotLabel(tomorrowConfirmed.startAtUtc ?? new Date(), 60)}`,
      payload: buildBookingPayload(tomorrowConfirmed),
      bookingId: tomorrowConfirmed.id,
      isRead: true,
      createdAtMinutesAgo: 60 * 26,
    });
  }

  // CHAT_MESSAGE_RECEIVED × 1 — read
  if (changeRequested) {
    plans.push({
      type: NotificationType.CHAT_MESSAGE_RECEIVED,
      title: `${changeRequested.clientName}: «удобно ли в 14:00?»`,
      body: "Новое сообщение в чате записи.",
      payload: {
        bookingId: changeRequested.id,
        senderType: "CLIENT",
      } as Prisma.InputJsonValue,
      bookingId: changeRequested.id,
      isRead: true,
      createdAtMinutesAgo: 60 * 4,
    });
  }

  // REVIEW_LEFT × 1 — read (older)
  if (reviewAnswered) {
    plans.push({
      type: NotificationType.REVIEW_LEFT,
      title: "Новый отзыв · 5★",
      body: "«Аня — золотые руки. Покрытие держится больше трёх недель.»",
      payload: {
        reviewId: reviewAnswered.id,
        bookingId: reviewAnswered.bookingId,
        authorId: reviewAnswered.authorId,
        rating: 5,
      } as Prisma.InputJsonValue,
      bookingId: reviewAnswered.bookingId,
      isRead: true,
      createdAtMinutesAgo: 60 * 24 * 2,
    });
  }

  // HOT_SLOT_BOOKED × 1 — read
  plans.push({
    type: NotificationType.HOT_SLOT_BOOKED,
    title: "Горячее окошко забронировано · −20%",
    body: "Сегодня 19:00 · 2 000 ₽",
    payload: {} as Prisma.InputJsonValue,
    isRead: true,
    createdAtMinutesAgo: 60 * 6,
  });

  // HOT_SLOT_EXPIRING × 1 — unread
  plans.push({
    type: NotificationType.HOT_SLOT_EXPIRING,
    title: "Окошко скоро истекает",
    body: "Завтра 15:00 · осталось меньше часа на бронь",
    payload: {} as Prisma.InputJsonValue,
    isRead: false,
    createdAtMinutesAgo: 15,
  });

  // MASTER_WEEKLY_STATS × 1 — read
  plans.push({
    type: NotificationType.MASTER_WEEKLY_STATS,
    title: "Ваша неделя: 12 записей, 35 200 ₽",
    body: "На 8% больше предыдущей недели",
    payload: {} as Prisma.InputJsonValue,
    isRead: true,
    createdAtMinutesAgo: 60 * 24 * 3,
  });

  // Persist all of them in one batch.
  for (const plan of plans) {
    const createdAt = new Date(Date.now() - plan.createdAtMinutesAgo * 60_000);
    await prisma.notification.create({
      data: {
        userId: args.userId,
        type: plan.type,
        title: plan.title,
        body: plan.body,
        payloadJson: plan.payload,
        bookingId: plan.bookingId ?? null,
        isRead: plan.isRead,
        readAt: plan.isRead ? createdAt : null,
        createdAt,
      },
    });
  }

  return { total: plans.length, unread: plans.filter((p) => !p.isRead).length };
}

function buildBookingPayload(booking: Booking): Prisma.InputJsonValue {
  return {
    bookingId: booking.id,
    bookingStatus: booking.status,
    providerId: booking.providerId,
    masterProviderId: booking.masterProviderId,
    serviceId: booking.serviceId,
    serviceName: null,
    startAtUtc: booking.startAtUtc ? booking.startAtUtc.toISOString() : null,
    clientName: booking.clientName,
    clientUserId: booking.clientUserId,
    studioId: booking.studioId,
  };
}

async function ensurePushSubscription(userId: string) {
  const endpoint = "https://fcm.googleapis.com/fcm/send/seed-showcase-anna";
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId,
      p256dh: "seed-showcase-p256dh",
      auth: "seed-showcase-auth",
    },
    create: {
      userId,
      endpoint,
      p256dh: "seed-showcase-p256dh",
      auth: "seed-showcase-auth",
    },
  });
}

/**
 * 3 model offers + 5 applications for the showcase master, used by the
 * 29a Model Offers cabinet surface. Idempotent: deletes existing
 * showcase offers/applications first (they're nameless so we identify
 * them by deterministic id prefix), then re-creates.
 *
 * Layout:
 *   Offer #1  +5 days  Manicure         no discount       2 PENDING
 *   Offer #2  +12 days Pedicure         30% off           1 PENDING + 1 APPROVED_WAITING_CLIENT
 *   Offer #3  -3 days  Brows           50% off           1 CONFIRMED + 1 REJECTED
 */
async function ensureModelOffers(args: {
  providerId: string;
  clients: UserProfile[];
  services: Map<string, Service>;
}): Promise<{ offers: number; applications: number }> {
  const offerIdPrefix = "seed-mo-anna-";

  // Wipe previous showcase offers (and their applications via cascade).
  await prisma.modelOffer.deleteMany({
    where: { masterId: args.providerId, id: { startsWith: offerIdPrefix } },
  });

  type ApplicationSeed = {
    suffix: string;
    clientIndex: number;
    status: ModelApplicationStatus;
    clientNote: string | null;
    consentToShoot: boolean;
    daysAgo: number;
  };

  type OfferSeed = {
    suffix: string;
    serviceKey: string;
    offsetDays: number;
    timeStart: string;
    timeEnd: string;
    discountPct: number; // 0 means no discount → offerPrice = regularPrice
    requirements: string[];
    extraBusyMin: number;
    status: ModelOfferStatus;
    applications: ApplicationSeed[];
  };

  const offerSeeds: OfferSeed[] = [
    {
      suffix: "01",
      serviceKey: "manicure",
      offsetDays: 5,
      timeStart: "11:00",
      timeEnd: "13:00",
      discountPct: 0,
      requirements: ["Натуральные ногти", "Без покрытия"],
      extraBusyMin: 30,
      status: ModelOfferStatus.ACTIVE,
      applications: [
        {
          suffix: "01-a",
          clientIndex: 1,
          status: ModelApplicationStatus.PENDING,
          clientNote: "Очень хочу попробовать новый формат — никогда не делала.",
          consentToShoot: true,
          daysAgo: 1,
        },
        {
          suffix: "01-b",
          clientIndex: 2,
          status: ModelApplicationStatus.PENDING,
          clientNote: "Готова приехать в любое время указанного интервала.",
          consentToShoot: true,
          daysAgo: 0,
        },
      ],
    },
    {
      suffix: "02",
      serviceKey: "pedicure",
      offsetDays: 12,
      timeStart: "14:00",
      timeEnd: "16:30",
      discountPct: 30,
      requirements: ["Без грибка", "Свежий душ"],
      extraBusyMin: 0,
      status: ModelOfferStatus.ACTIVE,
      applications: [
        {
          suffix: "02-a",
          clientIndex: 3,
          status: ModelApplicationStatus.PENDING,
          clientNote: "Беру скидку, спасибо!",
          consentToShoot: false,
          daysAgo: 2,
        },
        {
          suffix: "02-b",
          clientIndex: 4,
          status: ModelApplicationStatus.APPROVED_WAITING_CLIENT,
          clientNote: "Удобно после 14:30.",
          consentToShoot: true,
          daysAgo: 3,
        },
      ],
    },
    {
      suffix: "03",
      serviceKey: "brows",
      offsetDays: -3,
      timeStart: "10:00",
      timeEnd: "11:30",
      discountPct: 50,
      requirements: ["Без татуажа"],
      extraBusyMin: 15,
      status: ModelOfferStatus.CLOSED,
      applications: [
        {
          suffix: "03-a",
          clientIndex: 0,
          status: ModelApplicationStatus.CONFIRMED,
          clientNote: "Спасибо за приглашение!",
          consentToShoot: true,
          daysAgo: 8,
        },
        {
          suffix: "03-b",
          clientIndex: 5,
          status: ModelApplicationStatus.REJECTED,
          clientNote: null,
          consentToShoot: true,
          daysAgo: 9,
        },
      ],
    },
  ];

  let offerCount = 0;
  let applicationCount = 0;

  for (const offerSeed of offerSeeds) {
    const service = args.services.get(offerSeed.serviceKey);
    if (!service) continue;

    const offerPriceKopeks = offerSeed.discountPct > 0
      ? Math.round(service.price * (1 - offerSeed.discountPct / 100))
      : service.price;

    const dateBase = new Date();
    dateBase.setUTCDate(dateBase.getUTCDate() + offerSeed.offsetDays);
    const dateLocal = `${dateBase.getUTCFullYear()}-${String(dateBase.getUTCMonth() + 1).padStart(2, "0")}-${String(dateBase.getUTCDate()).padStart(2, "0")}`;

    const offer = await prisma.modelOffer.create({
      data: {
        id: `${offerIdPrefix}${offerSeed.suffix}`,
        masterId: args.providerId,
        serviceId: service.id,
        masterServiceId: null,
        serviceIds: [service.id],
        dateLocal,
        timeRangeStartLocal: offerSeed.timeStart,
        timeRangeEndLocal: offerSeed.timeEnd,
        price: new Prisma.Decimal(offerPriceKopeks),
        requirements: offerSeed.requirements,
        extraBusyMin: offerSeed.extraBusyMin,
        status: offerSeed.status,
      },
    });
    offerCount += 1;

    for (const appSeed of offerSeed.applications) {
      const client = args.clients[appSeed.clientIndex % args.clients.length];
      if (!client) continue;
      const createdAt = new Date(Date.now() - appSeed.daysAgo * DAY_MS);
      await prisma.modelApplication.create({
        data: {
          id: `seed-ma-anna-${appSeed.suffix}`,
          offerId: offer.id,
          clientUserId: client.id,
          status: appSeed.status,
          clientNote: appSeed.clientNote,
          consentToShoot: appSeed.consentToShoot,
          createdAt,
        },
      });
      applicationCount += 1;
    }
  }

  return { offers: offerCount, applications: applicationCount };
}

async function ensureClientCards(args: {
  providerId: string;
  clients: UserProfile[];
}) {
  const cards = [
    {
      clientIndex: 0,
      notes: "Любит классический френч. Аллергия на гель производителя X.",
      tags: ["VIP", "регулярный"],
    },
    {
      clientIndex: 1,
      notes: "Опаздывает обычно на 10–15 минут.",
      tags: ["осторожно"],
    },
    {
      clientIndex: 4,
      notes: "Предпочитает молчаливый формат — без small talk.",
      tags: ["тихо"],
    },
  ];

  for (const card of cards) {
    const client = args.clients[card.clientIndex];
    if (!client) continue;

    const existing = await prisma.clientCard.findFirst({
      where: { providerId: args.providerId, clientUserId: client.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.clientCard.update({
        where: { id: existing.id },
        data: { notes: card.notes, tags: card.tags },
      });
    } else {
      await prisma.clientCard.create({
        data: {
          providerId: args.providerId,
          clientUserId: client.id,
          clientPhone: client.phone ?? null,
          notes: card.notes,
          tags: card.tags,
        },
      });
    }
  }
}

export async function seedShowcaseMaster(input: Input): Promise<void> {
  logSeed.section("Showcase master (Анна Соколова)");
  const plan = findPlan(input.plans, "MASTER_PRO");
  if (plan.tier !== PlanTier.PRO && plan.tier !== PlanTier.PREMIUM) {
    logSeed.warn(`Showcase plan resolved to non-PRO (${plan.tier}); proceeding anyway.`);
  }

  const user = await ensureUser();
  const provider = await ensureProvider(user.id);
  await ensureMasterProfile(user.id, provider.id);
  await ensureSubscription(user.id, plan.id);
  logSeed.step("Профиль + подписка PRO");

  const services = await ensureServices(provider.id);
  logSeed.step(`Услуги (${services.size})`);

  await ensureSchedule(provider.id);
  logSeed.step("Расписание (Пн-Пт 10-20 c обедом, Сб 10-18, Вс выходной)");

  await ensureExceptions(provider.id);
  logSeed.step("Исключения (Майские · сокращённый день · отпуск)");

  await ensureHotSlots(provider.id, services);
  logSeed.step("Hot Slots (DiscountRule + 2 окошка)");

  const bookings = await ensureBookings({ providerId: provider.id, clients: input.clients, services });
  logSeed.step(`Записи (${bookings.length})`);

  const { unanswered, reviews } = await ensureReviews({ providerId: provider.id, bookings });
  logSeed.step(`Отзывы (${reviews.length}, без ответа: ${unanswered})`);

  const notifStats = await ensureNotifications({
    userId: user.id,
    bookings,
    reviews,
    clients: input.clients,
  });
  logSeed.step(`Уведомления (${notifStats.total}, непрочитанных: ${notifStats.unread})`);

  await ensurePushSubscription(user.id);
  logSeed.step("Push subscription (Push KPI «Включены»)");

  await ensureClientCards({ providerId: provider.id, clients: input.clients });
  logSeed.step("Клиентские карточки (3)");

  const offerStats = await ensureModelOffers({
    providerId: provider.id,
    clients: input.clients,
    services,
  });
  logSeed.step(`Офферы для моделей (${offerStats.offers}, заявок: ${offerStats.applications})`);

  logSeed.ok(
    `Готово. Login: phone ${PHONE} → /cabinet/master/dashboard. Public: /u/${PUBLIC_USERNAME}`
  );
}
