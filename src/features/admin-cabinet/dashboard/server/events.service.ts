import "server-only";

import {
  AccountType,
  AdminAuditAction,
  BillingPaymentStatus,
  BookingSource,
  ContentReportStatus,
  PdAccessActorType,
  PlanTier,
  ProviderType,
  type ContentReportReason,
  type ContentReportTargetType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildFilterFingerprint, recordPdAccess } from "@/lib/audit/pd-access";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { formatBookingWhenLabel } from "@/lib/notifications/format-booking-when";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";
import { moneyRUBFromKopeks } from "@/lib/format";
import * as UI_TEXT from "@/lib/ui/text";
import {
  ADMIN_EVENT_TYPES,
  adminEventTypesFor,
} from "@/features/admin-cabinet/dashboard/lib/event-categories";
import type {
  AdminEventAmountTone,
  AdminEventCategory,
  AdminEventDotTone,
  AdminEventItem,
  AdminEventPerson,
  AdminEventsResponse,
  AdminEventType,
} from "@/features/admin-cabinet/dashboard/types";

/**
 * ADMIN-EVENTS-02 — «История событий» админки.
 *
 * Десять источников (записи, отмены, регистрации, кабинеты, подписки, оплаты,
 * отзывы, жалобы на отзывы, жалобы на контент, действия админов) сливаются в
 * одну ленту от новых к старым. Каждое событие говорит, ЧТО произошло, КТО это
 * сделал и КОГО касается — полными именами со ссылкой на карточку в
 * «Пользователях» (раньше фамилия маскировалась, у регистраций имя пропадало
 * вовсе, а отмена записи не называла ни клиента, ни мастера).
 *
 * ## Курсор «Показать ещё»
 *
 * Прежний курсор был одной миллисекундой (`before`): события, записанные в
 * один момент (все записи пакета создаются одной транзакцией), на границе
 * страницы терялись. Теперь порядок полный — (время ↓, источник по
 * `ADMIN_EVENT_TYPES` ↑, id ↓), курсор — последнее показанное событие, и
 * каждый источник читает строки строго после него (`keysetWhere`). Каждый
 * источник отдаёт до `limit + 1` строк: лишняя говорит «есть дальше».
 *
 * Время — UTC-tech: наружу уходит момент (`timeIso` / `timeMs`), часы в поясе
 * зрителя рисует клиент. Время ВИЗИТА в подробностях — пояс салона с меткой
 * (rule 17, `formatBookingWhenLabel`).
 */

const T = UI_TEXT.adminPanel.dashboard.feed;
const D = T.details;

/** Верхняя граница одной страницы: и выдачи, и выборки из каждого источника. */
export const ADMIN_EVENTS_MAX_PAGE = 200;

/** Позиция последнего показанного события — с неё продолжает «Показать ещё». */
export type AdminEventsCursor = { ms: number; rank: number; id: string };

type FetchOpts = {
  /** Сколько событий вернуть. По умолчанию 30. */
  limit?: number;
  /** Опрос: только события не раньше этого момента (unix ms). Клиент сам
   *  отсеивает уже показанные по `id` — граница включительная, иначе событие
   *  той же миллисекунды, пришедшее позже, пропало бы. */
  sinceMs?: number;
  /** «Показать ещё»: события строго после этого. */
  after?: AdminEventsCursor | null;
  category?: AdminEventCategory;
  /** Кто смотрит — для следа чтения ПДн (RKN-FIX-10). Без него след не
   *  пишется: так вызывает выгрузка, у которой свой след `admin.events.export`. */
  actor?: { userId: string | null; ip: string | null };
};

const RANK = new Map<AdminEventType, number>(ADMIN_EVENT_TYPES.map((type, index) => [type, index]));

function rankOf(type: AdminEventType): number {
  return RANK.get(type) ?? 0;
}

export function encodeAdminEventsCursor(cursor: AdminEventsCursor): string {
  return encodeCursor(JSON.stringify([cursor.ms, cursor.rank, cursor.id]));
}

/** Курсор из запроса, либо null, если он не разбирается. */
export function decodeAdminEventsCursor(token: string): AdminEventsCursor | null {
  const raw = decodeCursor(token);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [ms, rank, id] = parsed as unknown[];
    if (typeof ms !== "number" || !Number.isSafeInteger(ms) || ms < 0) return null;
    if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 0 || rank >= ADMIN_EVENT_TYPES.length) {
      return null;
    }
    if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
    return { ms, rank, id };
  } catch {
    return null;
  }
}

type Window = { since: Date | null; after: AdminEventsCursor | null };

/**
 * Условие «строка источника идёт после курсора» в полном порядке ленты.
 * Источник раньше курсорного в `ADMIN_EVENT_TYPES` — в ту же миллисекунду уже
 * показан целиком (`lt`), позже — ещё не начат (`lte`), сам курсорный —
 * продолжается по id. Тип — общий для всех моделей: поле времени у источников
 * разное, поэтому вызывающий приводит результат к `WhereInput` своей модели.
 */
function keysetWhere(field: string, rank: number, window: Window, nullable = false): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  if (nullable) parts.push({ [field]: { not: null } });
  if (window.since) parts.push({ [field]: { gte: window.since } });
  const cursor = window.after;
  if (cursor) {
    const at = new Date(cursor.ms);
    if (rank < cursor.rank) parts.push({ [field]: { lt: at } });
    else if (rank > cursor.rank) parts.push({ [field]: { lte: at } });
    else parts.push({ OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: cursor.id } }] });
  }
  return parts;
}

function keysetOrder(field: string): Record<string, "desc">[] {
  return [{ [field]: "desc" }, { id: "desc" }];
}

// ─── Люди ──────────────────────────────────────────────────────────────────

const USER_SELECT = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
} satisfies Prisma.UserProfileSelect;

type UserRow = Prisma.UserProfileGetPayload<{ select: typeof USER_SELECT }>;

const PROVIDER_SELECT = {
  id: true,
  name: true,
  type: true,
  ownerUserId: true,
} satisfies Prisma.ProviderSelect;

type ProviderRow = Prisma.ProviderGetPayload<{ select: typeof PROVIDER_SELECT }>;

function userHref(userId: string): string {
  return `/admin/users?q=${encodeURIComponent(userId)}`;
}

/** Имя человека: как он назвался, иначе имя и фамилия, иначе контакт — у
 *  вошедшего по коду имени ещё нет, а «Без имени» на каждой регистрации
 *  ничего админу не говорит. */
function userName(user: UserRow): string {
  const display = user.displayName?.trim();
  if (display) return display;
  const full = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (full) return full;
  return user.phone?.trim() || user.email?.trim() || T.unnamed;
}

function userPerson(user: UserRow, role: string | null): AdminEventPerson {
  return { name: userName(user), role, href: userHref(user.id) };
}

function providerRole(type: ProviderType): string {
  return type === ProviderType.STUDIO ? T.roles.studio : T.roles.master;
}

function providerPerson(provider: ProviderRow): AdminEventPerson {
  return {
    name: provider.name.trim() || T.unnamed,
    role: providerRole(provider.type),
    href: provider.ownerUserId ? userHref(provider.ownerUserId) : null,
  };
}

const ROLE_LABEL: Record<AccountType, string> = {
  CLIENT: T.roles.client,
  MASTER: T.roles.master,
  STUDIO: T.roles.studio,
  STUDIO_ADMIN: T.roles.studioAdmin,
  ADMIN: T.roles.admin,
  SUPERADMIN: T.roles.admin,
};

/** Подпись строки для выгрузки: «Анна Соколова (мастер)». */
export function formatAdminEventPerson(person: AdminEventPerson | null): string {
  if (!person) return "";
  return person.role ? T.personWithRole(person.name, person.role) : person.name;
}

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

// ─── Сборка ────────────────────────────────────────────────────────────────

type Ranked = { item: AdminEventItem; rank: number; entityId: string };

function event(
  type: AdminEventType,
  entityId: string,
  at: Date,
  fields: {
    action: string;
    actor: AdminEventPerson | null;
    subject?: AdminEventPerson | null;
    details?: Array<string | null | undefined | false>;
    amountText?: string | null;
    amountTone?: AdminEventAmountTone;
    dotTone: AdminEventDotTone;
  },
): Ranked {
  return {
    rank: rankOf(type),
    entityId,
    item: {
      id: `${type}:${entityId}`,
      type,
      timeIso: at.toISOString(),
      timeMs: at.getTime(),
      action: fields.action,
      actor: fields.actor,
      subject: fields.subject ?? null,
      details: (fields.details ?? []).filter((line): line is string => Boolean(line)),
      amountText: fields.amountText ?? null,
      amountTone: fields.amountTone ?? "neutral",
      dotTone: fields.dotTone,
    },
  };
}

const BOOKING_SELECT = {
  id: true,
  createdAt: true,
  cancelledAtUtc: true,
  cancelledBy: true,
  cancelReason: true,
  startAtUtc: true,
  status: true,
  source: true,
  clientNameSnapshot: true,
  clientName: true,
  clientUser: { select: USER_SELECT },
  provider: { select: { ...PROVIDER_SELECT, timezone: true } },
  masterProvider: { select: { name: true } },
  service: { select: { name: true, price: true } },
  serviceItems: { select: { titleSnapshot: true, priceSnapshot: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.BookingSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

function bookingClient(booking: BookingRow): AdminEventPerson {
  const snapshot = (booking.clientNameSnapshot ?? booking.clientName)?.trim();
  if (booking.clientUser) {
    const person = userPerson(booking.clientUser, T.roles.client);
    return snapshot ? { ...person, name: snapshot } : person;
  }
  return { name: snapshot || T.unnamed, role: T.roles.client, href: null };
}

function bookingFacts(booking: BookingRow): { lines: string[]; priceKopeks: number | null } {
  const titles = booking.serviceItems.map((item) => item.titleSnapshot.trim()).filter(Boolean);
  const serviceNames = titles.length > 0 ? titles.join(", ") : booking.service?.name ?? null;
  const priceKopeks =
    booking.serviceItems.length > 0
      ? booking.serviceItems.reduce((sum, item) => sum + item.priceSnapshot, 0)
      : booking.service?.price ?? null;
  const when = formatBookingWhenLabel(booking.startAtUtc, booking.provider.timezone);
  const lines: string[] = [];
  if (serviceNames) lines.push(D.service(serviceNames));
  if (when) lines.push(D.visit(when));
  if (booking.provider.type === ProviderType.STUDIO && booking.masterProvider?.name) {
    lines.push(D.master(booking.masterProvider.name));
  }
  return { lines, priceKopeks: priceKopeks && priceKopeks > 0 ? priceKopeks : null };
}

function bookingEvent(booking: BookingRow): Ranked {
  const client = bookingClient(booking);
  const provider = providerPerson(booking.provider);
  const manual = booking.source === BookingSource.MANUAL;
  const facts = bookingFacts(booking);
  return event("booking", booking.id, booking.createdAt, {
    action: manual ? T.actions.bookingManual : T.actions.booking,
    // Ручную запись заводит мастер или студия — они и «кто», клиент — «кого».
    actor: manual ? provider : client,
    subject: manual ? client : provider,
    details: [
      ...facts.lines,
      manual ? null : D.source[booking.source],
      D.statusNow(D.bookingStatus[booking.status]),
    ],
    amountText: facts.priceKopeks ? moneyRUBFromKopeks(facts.priceKopeks) : null,
    dotTone: "ok",
  });
}

function cancellationEvent(booking: BookingRow, at: Date): Ranked {
  const client = bookingClient(booking);
  const provider = providerPerson(booking.provider);
  const facts = bookingFacts(booking);
  const by = booking.cancelledBy;
  const reason = booking.cancelReason?.trim();
  // Отменил клиент — «кого касается» мастер или студия; отменила сторона
  // мастера или система (неподтверждённая запись истекла) — клиент, а к кому
  // была запись, говорит строка подробностей.
  const actor =
    by === "CLIENT" ? client : by === "PROVIDER" ? provider : by === "SYSTEM" ? { name: T.system, role: null, href: null } : null;
  return event("booking_cancel", booking.id, at, {
    action: T.actions.bookingCancel,
    actor,
    subject: by === "CLIENT" ? provider : client,
    details: [
      by ? D.cancelledBy[by] : null,
      by === "CLIENT" || by === "PROVIDER" ? null : D.bookedWith(formatAdminEventPerson(provider)),
      ...facts.lines,
      reason ? D.reason(clip(reason, 160)) : null,
    ],
    amountText: facts.priceKopeks ? `${T.cancelPrefix}${moneyRUBFromKopeks(facts.priceKopeks)}` : null,
    amountTone: "negative",
    dotTone: "cancel",
  });
}

/** Подробности действия админа и тот, кого оно касается. */
type AdminTargetView = { subject: AdminEventPerson | null; details: string[]; amountText?: string | null };

type AdminTargets = {
  users: Map<string, UserRow>;
  payments: Map<string, { amountKopeks: number; user: UserRow; planName: string }>;
  subscriptions: Map<string, { user: UserRow; planName: string }>;
  reviews: Map<string, { rating: number; targetId: string; author: UserRow }>;
  reports: Map<
    string,
    { targetType: ContentReportTargetType; targetProviderId: string | null; reason: ContentReportReason }
  >;
  cities: Map<string, string>;
  categories: Map<string, string>;
  plans: Map<string, string>;
  providers: Map<string, ProviderRow>;
};

function detailString(details: Prisma.JsonValue | null, key: string): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function detailValue(details: Prisma.JsonValue | null, key: string): unknown {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return (details as Record<string, unknown>)[key];
}

const FLAG_LABELS = UI_TEXT.adminPanel.settings.sections.flags.flags;

function settingLabel(key: string): string {
  if (key in FLAG_LABELS) return FLAG_LABELS[key as keyof typeof FLAG_LABELS].label;
  if (key === "vkCommunity") return UI_TEXT.adminPanel.settings.sections.vkCommunity.title;
  if (key === "seo") return UI_TEXT.adminPanel.settings.sections.seo.title;
  return key;
}

function adminTargetView(
  log: { targetType: string | null; targetId: string | null; details: Prisma.JsonValue | null },
  targets: AdminTargets,
): AdminTargetView {
  const id = log.targetId;
  if (!id) return { subject: null, details: [] };
  switch (log.targetType) {
    case "user": {
      const user = targets.users.get(id);
      const plan = detailString(log.details, "newPlanCode");
      return { subject: user ? userPerson(user, T.roles.user) : null, details: plan ? [D.plan(plan)] : [] };
    }
    case "payment": {
      const payment = targets.payments.get(id);
      const refund = detailValue(log.details, "amountKopeks");
      const refundKopeks = typeof refund === "number" && refund > 0 ? refund : payment?.amountKopeks ?? null;
      return {
        subject: payment ? userPerson(payment.user, T.roles.user) : null,
        details: payment ? [D.plan(payment.planName)] : [],
        amountText: refundKopeks ? `${T.cancelPrefix}${moneyRUBFromKopeks(refundKopeks)}` : null,
      };
    }
    case "subscription": {
      const subscription = targets.subscriptions.get(id);
      return {
        subject: subscription ? userPerson(subscription.user, T.roles.user) : null,
        details: subscription ? [D.plan(subscription.planName)] : [],
      };
    }
    case "review": {
      const review = targets.reviews.get(id);
      if (!review) return { subject: null, details: [] };
      const about = targets.providers.get(review.targetId);
      return {
        subject: userPerson(review.author, T.roles.client),
        details: [UI_TEXT.adminPanel.reports.target.review(review.rating, about?.name ?? null)],
      };
    }
    case "ContentReport": {
      const report = targets.reports.get(id);
      if (!report) return { subject: null, details: [] };
      const offender = report.targetProviderId ? targets.providers.get(report.targetProviderId) : undefined;
      return {
        subject: offender ? providerPerson(offender) : null,
        details: [
          T.actions.contentReport(UI_TEXT.adminPanel.reports.targetTypes[report.targetType]),
          D.reason(UI_TEXT.adminPanel.reports.reasons[report.reason]),
        ],
      };
    }
    case "city": {
      const source = detailString(log.details, "sourceName");
      const target = detailString(log.details, "targetName");
      if (source && target) return { subject: null, details: [D.cityMerged(source, target)] };
      const name = targets.cities.get(id) ?? detailString(log.details, "name");
      return { subject: null, details: name ? [D.city(name)] : [] };
    }
    case "category": {
      const name = targets.categories.get(id) ?? detailString(log.details, "name");
      return { subject: null, details: name ? [D.category(name)] : [] };
    }
    case "billing_plan": {
      const name = targets.plans.get(id);
      return { subject: null, details: name ? [D.plan(name)] : [] };
    }
    case "system_config": {
      const value = detailValue(log.details, "value");
      return {
        subject: null,
        details: [typeof value === "boolean" ? D.flag(settingLabel(id), value) : D.setting(settingLabel(id))],
      };
    }
    case "app_setting":
      return { subject: null, details: [D.setting(settingLabel(id))] };
    default:
      return { subject: null, details: [] };
  }
}

function idsOf(logs: Array<{ targetType: string | null; targetId: string | null }>, type: string): string[] {
  const ids = new Set<string>();
  for (const log of logs) if (log.targetType === type && log.targetId) ids.add(log.targetId);
  return [...ids];
}

/** Пакетная загрузка по id; без id — без запроса к базе. */
function loadByIds<T>(ids: string[], load: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  return ids.length ? load(ids) : Promise.resolve([]);
}

async function loadAdminTargets(
  logs: Array<{ targetType: string | null; targetId: string | null }>,
  providerIds: Set<string>,
): Promise<AdminTargets> {
  const [users, payments, subscriptions, reviews, reports, cities, categories, plans] = await Promise.all([
    loadByIds(idsOf(logs, "user"), (ids) =>
      prisma.userProfile.findMany({ where: { id: { in: ids } }, select: USER_SELECT }),
    ),
    loadByIds(idsOf(logs, "payment"), (ids) =>
      prisma.billingPayment.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          amountKopeks: true,
          subscription: { select: { user: { select: USER_SELECT }, plan: { select: { name: true } } } },
        },
      }),
    ),
    loadByIds(idsOf(logs, "subscription"), (ids) =>
      prisma.userSubscription.findMany({
        where: { id: { in: ids } },
        select: { id: true, user: { select: USER_SELECT }, plan: { select: { name: true } } },
      }),
    ),
    // Отзыв, который админ удалил, тоже нужен — поэтому без ACTIVE_REVIEW_FILTER.
    loadByIds(idsOf(logs, "review"), (ids) =>
      prisma.review.findMany({
        where: { id: { in: ids } },
        select: { id: true, rating: true, targetId: true, author: { select: USER_SELECT } },
      }),
    ),
    loadByIds(idsOf(logs, "ContentReport"), (ids) =>
      prisma.contentReport.findMany({
        where: { id: { in: ids } },
        select: { id: true, targetType: true, targetProviderId: true, reason: true },
      }),
    ),
    loadByIds(idsOf(logs, "city"), (ids) =>
      prisma.city.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ),
    loadByIds(idsOf(logs, "category"), (ids) =>
      prisma.globalCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ),
    loadByIds(idsOf(logs, "billing_plan"), (ids) =>
      prisma.billingPlan.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ),
  ]);

  for (const review of reviews) providerIds.add(review.targetId);
  for (const report of reports) if (report.targetProviderId) providerIds.add(report.targetProviderId);

  const providers = providerIds.size
    ? await prisma.provider.findMany({ where: { id: { in: [...providerIds] } }, select: PROVIDER_SELECT })
    : [];

  return {
    users: new Map(users.map((user) => [user.id, user])),
    payments: new Map(
      payments.map((payment) => [
        payment.id,
        { amountKopeks: payment.amountKopeks, user: payment.subscription.user, planName: payment.subscription.plan.name },
      ]),
    ),
    subscriptions: new Map(subscriptions.map((row) => [row.id, { user: row.user, planName: row.plan.name }])),
    reviews: new Map(reviews.map((row) => [row.id, { rating: row.rating, targetId: row.targetId, author: row.author }])),
    reports: new Map(
      reports.map((row) => [row.id, { targetType: row.targetType, targetProviderId: row.targetProviderId, reason: row.reason }]),
    ),
    cities: new Map(cities.map((row) => [row.id, row.name])),
    categories: new Map(categories.map((row) => [row.id, row.name])),
    plans: new Map(plans.map((row) => [row.id, row.name])),
    providers: new Map(providers.map((row) => [row.id, row])),
  };
}

const ADMIN_ACTION_LABEL: Record<AdminAuditAction, string> = T.actions.admin;

const REVIEW_REPORT_REASONS = UI_TEXT.adminPanel.reviews.reportReasons;

/**
 * Страница истории: события всех источников раздела `category`, от новых к
 * старым, строго после курсора `after`.
 */
export async function getAdminEvents(opts: FetchOpts = {}): Promise<AdminEventsResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), ADMIN_EVENTS_MAX_PAGE);
  const take = limit + 1;
  const window: Window = {
    since: opts.sinceMs ? new Date(opts.sinceMs) : null,
    after: opts.after ?? null,
  };
  const wanted = new Set(adminEventTypesFor(opts.category ?? "all"));
  const where = (type: AdminEventType, field: string, nullable = false) =>
    keysetWhere(field, rankOf(type), window, nullable);

  const [
    bookings,
    cancellations,
    registrations,
    cabinets,
    subscriptions,
    payments,
    reviews,
    complaints,
    contentReports,
    adminLogs,
  ] = await Promise.all([
    wanted.has("booking")
      ? prisma.booking.findMany({
          where: { AND: where("booking", "createdAt") as Prisma.BookingWhereInput[] },
          orderBy: keysetOrder("createdAt") as Prisma.BookingOrderByWithRelationInput[],
          take,
          select: BOOKING_SELECT,
        })
      : [],
    wanted.has("booking_cancel")
      ? prisma.booking.findMany({
          where: { AND: where("booking_cancel", "cancelledAtUtc", true) as Prisma.BookingWhereInput[] },
          orderBy: keysetOrder("cancelledAtUtc") as Prisma.BookingOrderByWithRelationInput[],
          take,
          select: BOOKING_SELECT,
        })
      : [],
    wanted.has("registration")
      ? prisma.userProfile.findMany({
          where: {
            isDeleted: false,
            AND: where("registration", "createdAt") as Prisma.UserProfileWhereInput[],
          },
          orderBy: keysetOrder("createdAt") as Prisma.UserProfileOrderByWithRelationInput[],
          take,
          select: { ...USER_SELECT, createdAt: true, roles: true },
        })
      : [],
    // Кабинет — строка провайдера с владельцем и профилем мастера или студии.
    // Профиль мастера в студии (без `MasterProfile`) — не новый кабинет, а
    // вступление в студию; удалённый кабинет теряет владельца.
    wanted.has("cabinet_created")
      ? prisma.provider.findMany({
          where: {
            ownerUserId: { not: null },
            OR: [
              { type: ProviderType.MASTER, masterProfile: { isNot: null } },
              { type: ProviderType.STUDIO, studioProfile: { isNot: null } },
            ],
            AND: where("cabinet_created", "createdAt") as Prisma.ProviderWhereInput[],
          },
          orderBy: keysetOrder("createdAt") as Prisma.ProviderOrderByWithRelationInput[],
          take,
          select: {
            id: true,
            name: true,
            type: true,
            createdAt: true,
            city: { select: { name: true } },
            owner: { select: USER_SELECT },
          },
        })
      : [],
    wanted.has("subscription")
      ? prisma.userSubscription.findMany({
          where: {
            plan: { tier: { not: PlanTier.FREE } },
            AND: where("subscription", "startedAt") as Prisma.UserSubscriptionWhereInput[],
          },
          orderBy: keysetOrder("startedAt") as Prisma.UserSubscriptionOrderByWithRelationInput[],
          take,
          select: {
            id: true,
            startedAt: true,
            scope: true,
            isTrial: true,
            periodMonths: true,
            plan: { select: { name: true } },
            user: { select: USER_SELECT },
          },
        })
      : [],
    wanted.has("payment")
      ? prisma.billingPayment.findMany({
          where: { AND: where("payment", "createdAt") as Prisma.BillingPaymentWhereInput[] },
          orderBy: keysetOrder("createdAt") as Prisma.BillingPaymentOrderByWithRelationInput[],
          take,
          select: {
            id: true,
            createdAt: true,
            status: true,
            amountKopeks: true,
            periodMonths: true,
            subscription: { select: { scope: true, plan: { select: { name: true } }, user: { select: USER_SELECT } } },
          },
        })
      : [],
    wanted.has("review")
      ? prisma.review.findMany({
          where: { ...ACTIVE_REVIEW_FILTER, AND: where("review", "createdAt") as Prisma.ReviewWhereInput[] },
          orderBy: keysetOrder("createdAt") as Prisma.ReviewOrderByWithRelationInput[],
          take,
          select: {
            id: true,
            createdAt: true,
            rating: true,
            text: true,
            targetId: true,
            author: { select: USER_SELECT },
            master: { select: { name: true } },
          },
        })
      : [],
    // Жалоба мастера или студии на отзыв о себе. Кто нажал «Пожаловаться»,
    // схема не хранит — жалуется сторона, о которой отзыв.
    wanted.has("complaint")
      ? prisma.review.findMany({
          where: { ...ACTIVE_REVIEW_FILTER, AND: where("complaint", "reportedAt", true) as Prisma.ReviewWhereInput[] },
          orderBy: keysetOrder("reportedAt") as Prisma.ReviewOrderByWithRelationInput[],
          take,
          select: {
            id: true,
            reportedAt: true,
            reportReason: true,
            reportComment: true,
            rating: true,
            text: true,
            targetId: true,
            author: { select: USER_SELECT },
          },
        })
      : [],
    wanted.has("content_report")
      ? prisma.contentReport.findMany({
          where: { AND: where("content_report", "createdAt") as Prisma.ContentReportWhereInput[] },
          orderBy: keysetOrder("createdAt") as Prisma.ContentReportOrderByWithRelationInput[],
          take,
          select: {
            id: true,
            createdAt: true,
            targetType: true,
            targetProviderId: true,
            reason: true,
            comment: true,
            status: true,
            reporter: { select: USER_SELECT },
          },
        })
      : [],
    wanted.has("admin_action")
      ? prisma.adminAuditLog.findMany({
          where: { AND: where("admin_action", "createdAt") as Prisma.AdminAuditLogWhereInput[] },
          orderBy: keysetOrder("createdAt") as Prisma.AdminAuditLogOrderByWithRelationInput[],
          take,
          select: {
            id: true,
            createdAt: true,
            action: true,
            targetType: true,
            targetId: true,
            details: true,
            reason: true,
            admin: { select: USER_SELECT },
          },
        })
      : [],
  ]);

  const providerIds = new Set<string>();
  for (const review of reviews) providerIds.add(review.targetId);
  for (const review of complaints) providerIds.add(review.targetId);
  for (const report of contentReports) if (report.targetProviderId) providerIds.add(report.targetProviderId);
  const targets = await loadAdminTargets(adminLogs, providerIds);
  const provider = (id: string | null) => (id ? targets.providers.get(id) ?? null : null);

  const ranked: Ranked[] = [];

  for (const booking of bookings) ranked.push(bookingEvent(booking));

  for (const booking of cancellations) {
    if (booking.cancelledAtUtc) ranked.push(cancellationEvent(booking, booking.cancelledAtUtc));
  }

  for (const user of registrations) {
    const roles = [...new Set(user.roles.map((role) => ROLE_LABEL[role]))];
    ranked.push(
      event("registration", user.id, user.createdAt, {
        action: T.actions.registration,
        actor: userPerson(user, null),
        details: roles.length ? [D.roles(roles.join(", "))] : [],
        dotTone: "new",
      }),
    );
  }

  for (const cabinet of cabinets) {
    const studio = cabinet.type === ProviderType.STUDIO;
    ranked.push(
      event("cabinet_created", cabinet.id, cabinet.createdAt, {
        action: studio ? T.actions.cabinetStudio : T.actions.cabinetMaster,
        actor: cabinet.owner ? userPerson(cabinet.owner, null) : null,
        details: [
          cabinet.name.trim() ? D.cabinetName(cabinet.name.trim()) : null,
          cabinet.city?.name ? D.city(cabinet.city.name) : null,
        ],
        dotTone: "new",
      }),
    );
  }

  for (const subscription of subscriptions) {
    ranked.push(
      event("subscription", subscription.id, subscription.startedAt, {
        action: subscription.isTrial
          ? T.actions.trial(subscription.plan.name)
          : T.actions.subscription(subscription.plan.name),
        actor: userPerson(subscription.user, null),
        details: [D.scope[subscription.scope], subscription.isTrial ? null : D.period(subscription.periodMonths)],
        dotTone: "sub",
      }),
    );
  }

  for (const payment of payments) {
    const succeeded = payment.status === BillingPaymentStatus.SUCCEEDED;
    const refunded = payment.status === BillingPaymentStatus.REFUNDED;
    const money = payment.amountKopeks > 0 ? moneyRUBFromKopeks(payment.amountKopeks) : null;
    ranked.push(
      event("payment", payment.id, payment.createdAt, {
        action: T.actions.payment[payment.status],
        actor: userPerson(payment.subscription.user, null),
        details: [
          D.plan(payment.subscription.plan.name),
          D.scope[payment.subscription.scope],
          D.period(payment.periodMonths),
        ],
        amountText: money ? (refunded ? `${T.cancelPrefix}${money}` : money) : null,
        amountTone: succeeded ? "positive" : refunded ? "negative" : "neutral",
        dotTone: succeeded ? "sub" : refunded || payment.status === BillingPaymentStatus.FAILED ? "cancel" : "ok",
      }),
    );
  }

  for (const review of reviews) {
    const about = provider(review.targetId);
    const text = review.text?.trim();
    ranked.push(
      event("review", review.id, review.createdAt, {
        action: T.actions.review(review.rating),
        actor: userPerson(review.author, T.roles.client),
        subject: about ? providerPerson(about) : null,
        details: [review.master?.name ? D.master(review.master.name) : null, text ? D.quote(clip(text, 160)) : null],
        dotTone: review.rating <= 2 ? "alert" : "ok",
      }),
    );
  }

  for (const review of complaints) {
    if (!review.reportedAt) continue;
    const about = provider(review.targetId);
    const comment = review.reportComment?.trim();
    const text = review.text?.trim();
    ranked.push(
      event("complaint", review.id, review.reportedAt, {
        action: T.actions.complaint,
        actor: about ? providerPerson(about) : null,
        subject: userPerson(review.author, T.roles.client),
        details: [
          review.reportReason ? D.reason(REVIEW_REPORT_REASONS[review.reportReason]) : null,
          comment ? D.comment(clip(comment, 160)) : null,
          D.reviewOf(review.rating, text ? clip(text, 120) : null),
          D.complaintOpen,
        ],
        dotTone: "alert",
      }),
    );
  }

  for (const report of contentReports) {
    const open = report.status === ContentReportStatus.NEW;
    const offender = provider(report.targetProviderId);
    const comment = report.comment?.trim();
    ranked.push(
      event("content_report", report.id, report.createdAt, {
        action: T.actions.contentReport(UI_TEXT.adminPanel.reports.targetTypes[report.targetType]),
        actor: userPerson(report.reporter, null),
        subject: offender ? providerPerson(offender) : null,
        details: [
          D.reason(UI_TEXT.adminPanel.reports.reasons[report.reason]),
          comment ? D.comment(clip(comment, 160)) : null,
          D.reportStatus(UI_TEXT.adminPanel.reports.statuses[report.status]),
        ],
        dotTone: open ? "alert" : "ok",
      }),
    );
  }

  for (const log of adminLogs) {
    const view = adminTargetView(log, targets);
    const reason = log.reason?.trim();
    ranked.push(
      event("admin_action", log.id, log.createdAt, {
        action: ADMIN_ACTION_LABEL[log.action],
        actor: userPerson(log.admin, T.roles.admin),
        subject: view.subject,
        details: [...view.details, reason ? D.note(clip(reason, 200)) : null],
        amountText: view.amountText ?? null,
        amountTone: view.amountText ? "negative" : "neutral",
        dotTone: "new",
      }),
    );
  }

  // Источники уже идут в порядке `ADMIN_EVENT_TYPES`, а внутри — по (время,
  // id) из базы; сортировка устойчивая, поэтому события одной миллисекунды и
  // одного источника сохраняют порядок базы — тот же, что у `keysetWhere`.
  ranked.sort((a, b) => b.item.timeMs - a.item.timeMs || a.rank - b.rank);
  const page = ranked.slice(0, limit);
  const last = page[page.length - 1];

  // RKN-FIX-10: лента несёт полные имена клиентов и мастеров — массовое
  // чтение ПДн. Опрос новых (`sinceMs`) следа не пишет: см. `admin.events.list`.
  if (opts.actor && !opts.sinceMs) {
    await recordPdAccess({
      surface: "admin.events.list",
      actorType: PdAccessActorType.ADMIN,
      actorUserId: opts.actor.userId,
      entityType: "AdminEvent",
      rowCount: page.length,
      filterFingerprint: buildFilterFingerprint(
        { category: (opts.category ?? "all") !== "all", cursor: Boolean(opts.after) },
        { limit },
      ),
      ipAddress: opts.actor.ip,
    });
  }

  return {
    items: page.map((entry) => entry.item),
    nextCursor:
      ranked.length > limit && last
        ? encodeAdminEventsCursor({ ms: last.item.timeMs, rank: last.rank, id: last.entityId })
        : null,
  };
}

/** Выгрузка «Истории событий»: допустимые периоды, дни. */
export const ADMIN_EVENTS_EXPORT_DAYS = [7, 30, 90] as const;
export type AdminEventsExportDays = (typeof ADMIN_EVENTS_EXPORT_DAYS)[number];
/** Потолок строк выгрузки — файл остаётся быстрым, а выгрузка ограниченной. */
export const ADMIN_EVENTS_EXPORT_MAX_ROWS = 10_000;

/**
 * ADMIN-EVENTS-EXPORT — все события раздела за период, страницами по
 * `ADMIN_EVENTS_MAX_PAGE` от новых к старым, не больше
 * `ADMIN_EVENTS_EXPORT_MAX_ROWS`. Возвращает и признак обрезки.
 */
export async function collectAdminEventsForExport(
  days: AdminEventsExportDays,
  category: AdminEventCategory = "all",
  now: Date = new Date(),
): Promise<{ items: AdminEventItem[]; truncated: boolean }> {
  const sinceMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const items: AdminEventItem[] = [];
  let after: AdminEventsCursor | null = null;
  let more = true;
  while (more && items.length < ADMIN_EVENTS_EXPORT_MAX_ROWS) {
    const page = await getAdminEvents({ limit: ADMIN_EVENTS_MAX_PAGE, sinceMs, after, category });
    items.push(...page.items);
    after = page.nextCursor ? decodeAdminEventsCursor(page.nextCursor) : null;
    more = after !== null;
  }
  return {
    items: items.slice(0, ADMIN_EVENTS_EXPORT_MAX_ROWS),
    truncated: items.length >= ADMIN_EVENTS_EXPORT_MAX_ROWS && more,
  };
}
