import "server-only";

import { BookingStatus, type BookingCancelledBy, type BookingSource, type Prisma } from "@prisma/client";
import { masterPerformedBookingWhere } from "@/lib/bookings/master-booking-scope";
import { BOOKING_CHANGE_REQUEST_LIMIT, resolveBookingRuntimeStatus, type BookingRuntimeStatus } from "@/lib/bookings/flow";
import {
  bookingNeedsMasterAnswer,
  resolveMasterBookingActions,
  type MasterBookingActions,
} from "@/lib/bookings/master-actions";
import { resolveBookingWorkContext, type BookingWorkContext } from "@/lib/bookings/work-context";
import { getOrCreateConversationSlug } from "@/lib/chat/conversation-slug";
import { buildClientKey } from "@/lib/crm/client-key";
import type { MasterWorkProfiles } from "@/lib/master/access";
import { signClientKeyToken } from "@/lib/master/client-key-token";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { encodePublicId } from "@/lib/public-id";

/**
 * MOBILE-MASTER-C — запись кабинета мастера в JSON для приложения.
 *
 * Веб-кабинет читает записи сервисами страниц (`dashboard.service`,
 * `bookings.service` — канбан, `schedule.service` — неделя), и у каждого своя
 * урезанная форма карточки под свой экран. Приложению нужна ОДНА форма на все
 * списки и карточку записи, поэтому сервисы страниц решают «какие записи и в
 * каком порядке» (окна, колонки, сутки салона, KPI — бизнес-логика остаётся
 * там), а этот модуль по их id собирает единый элемент одним запросом.
 *
 * Действия (`actions`) — общее правило `bookings/master-actions.ts`, повторяющее
 * проверки сервера. Слаг переписки — только у записи к мастеру (переписка
 * ключуется `providerId` записи, у студийной записи её нет — инв. #26).
 *
 * Телефона клиента в элементе списка НЕТ намеренно: список записей за
 * 4 месяца с телефонами — это перечисление клиентской базы мимо следа
 * массовых чтений ПДн (RKN-FIX-10, `master.clients.list`). Телефон — в
 * карточке одной записи (`getMasterBookingDetail`), как у CRM-карточки клиента.
 */

const ITEM_SELECT = {
  id: true,
  status: true,
  source: true,
  startAtUtc: true,
  endAtUtc: true,
  proposedStartAt: true,
  proposedEndAt: true,
  requestedBy: true,
  actionRequiredBy: true,
  changeComment: true,
  masterChangeRequestsCount: true,
  bookingPackageId: true,
  providerId: true,
  studioId: true,
  clientUserId: true,
  clientName: true,
  clientUser: { select: { externalPhotoUrl: true } },
  provider: { select: { type: true, name: true, timezone: true } },
  masterProvider: { select: { timezone: true } },
  service: { select: { name: true, title: true, price: true, durationMin: true } },
  serviceItems: {
    select: { titleSnapshot: true, priceSnapshot: true, durationSnapshotMin: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.BookingSelect;

const DETAIL_SELECT = {
  ...ITEM_SELECT,
  createdAt: true,
  clientPhone: true,
  clientPhoneSnapshot: true,
  comment: true,
  silentMode: true,
  bookingAnswers: true,
  clientChangeRequestsCount: true,
  cancelledBy: true,
  cancelReason: true,
  cancelledAtUtc: true,
  review: {
    select: {
      id: true,
      rating: true,
      text: true,
      replyText: true,
      repliedAt: true,
      createdAt: true,
      deletedAt: true,
      targetType: true,
    },
  },
} satisfies Prisma.BookingSelect;

type ItemRow = Prisma.BookingGetPayload<{ select: typeof ITEM_SELECT }>;
type DetailRow = Prisma.BookingGetPayload<{ select: typeof DETAIL_SELECT }>;

export type MasterBookingServiceLine = {
  title: string;
  /** Копейки, цена на момент записи. */
  price: number;
  durationMin: number;
};

export type MasterBookingItem = {
  id: string;
  /** Статус в БД. */
  status: BookingStatus;
  /** Вычисляемый статус (`resolveBookingRuntimeStatus`): начавшаяся — IN_PROGRESS, через час после конца — FINISHED. */
  runtimeStatus: BookingRuntimeStatus;
  source: BookingSource;
  startAtUtc: string | null;
  endAtUtc: string | null;
  durationMin: number;
  /** IANA-пояс салона записи — в нём показывать её время. */
  timezone: string;
  /** Предложенное время переноса; только при CHANGE_REQUESTED. */
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  requestedBy: "CLIENT" | "MASTER" | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  /** Комментарий к переносу / причина отмены. */
  changeComment: string | null;
  /** Ждёт ответа мастера (новая запись или перенос от клиента). */
  needsAnswer: boolean;
  clientName: string;
  clientUserId: string | null;
  clientAvatarUrl: string | null;
  /** Завершённых визитов клиента к мастеру (по всем его профилям); `null` у гостя. */
  finishedVisitsCount: number | null;
  /** Зарегистрированный клиент без завершённых визитов. */
  isNewClient: boolean;
  serviceTitle: string;
  services: MasterBookingServiceLine[];
  /** Копейки: сумма услуг записи. */
  price: number;
  bookingPackageId: string | null;
  workContext: BookingWorkContext;
  chatSlug: string | null;
  actions: MasterBookingActions;
};

export type MasterBookingDetail = MasterBookingItem & {
  createdAt: string;
  client: {
    name: string;
    /** Телефон из записи (нормализованный, если разбирается); `null` — не оставлен. */
    phone: string | null;
    userId: string | null;
    /** Ключ CRM-карточки (`/api/master/clients/{key}/detail|card`); `null` — ни аккаунта, ни телефона. */
    key: string | null;
    /** Токен истории клиента для `GET /api/cabinet/master/bookings?client=`. */
    historyToken: string | null;
  };
  /** Комментарий клиента к записи. */
  comment: string | null;
  silentMode: boolean;
  /** Ответы клиента на вопросы мастера к услуге. */
  answers: Array<{ question: string; answer: string }>;
  clientChangeRequestsCount: number;
  masterChangeRequestsCount: number;
  changeRequestLimit: number;
  cancelledBy: BookingCancelledBy | null;
  cancelReason: string | null;
  cancelledAtUtc: string | null;
  review: {
    /** Публичный токен отзыва — для `/api/reviews/{id}/reply`. */
    id: string;
    rating: number;
    text: string | null;
    replyText: string | null;
    repliedAt: string | null;
    createdAt: string;
    /** Отзыв о визите в студию: отвечает студия, у мастера — только чтение. */
    canReply: boolean;
  } | null;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function serviceLines(row: ItemRow): MasterBookingServiceLine[] {
  if (row.serviceItems.length > 0) {
    return row.serviceItems.map((item) => ({
      title: item.titleSnapshot,
      price: item.priceSnapshot,
      durationMin: item.durationSnapshotMin,
    }));
  }
  return [
    {
      title: row.service.title?.trim() || row.service.name,
      price: row.service.price,
      durationMin: row.service.durationMin,
    },
  ];
}

function durationMinutes(row: ItemRow): number {
  if (row.startAtUtc && row.endAtUtc) {
    const diff = Math.round((row.endAtUtc.getTime() - row.startAtUtc.getTime()) / 60_000);
    if (diff > 0) return diff;
  }
  return row.service.durationMin;
}

/** Переписка ключуется `providerId` записи и есть только у записи к мастеру (инв. #26). */
function chatKeyOf(row: Pick<ItemRow, "clientUserId" | "providerId" | "provider">): string | null {
  if (!row.clientUserId || row.provider.type !== "MASTER") return null;
  return `${row.providerId}:${row.clientUserId}`;
}

/**
 * Слаги переписок пачкой: существующие — одним запросом, недостающие создаются
 * лениво тем же `getOrCreateConversationSlug`, что у дашборда веба.
 */
async function resolveChatSlugs(rows: ItemRow[]): Promise<Map<string, string>> {
  const pairs = new Map<string, { providerId: string; clientUserId: string }>();
  for (const row of rows) {
    const key = chatKeyOf(row);
    if (key && row.clientUserId) pairs.set(key, { providerId: row.providerId, clientUserId: row.clientUserId });
  }
  const slugs = new Map<string, string>();
  if (pairs.size === 0) return slugs;

  const list = Array.from(pairs.values());
  const existing = await prisma.conversationSlug.findMany({
    where: {
      providerId: { in: Array.from(new Set(list.map((pair) => pair.providerId))) },
      clientUserId: { in: Array.from(new Set(list.map((pair) => pair.clientUserId))) },
    },
    select: { providerId: true, clientUserId: true, slug: true },
  });
  for (const row of existing) slugs.set(`${row.providerId}:${row.clientUserId}`, row.slug);

  const missing = Array.from(pairs.entries()).filter(([key]) => !slugs.has(key));
  const created = await Promise.all(missing.map(([, pair]) => getOrCreateConversationSlug(pair)));
  missing.forEach(([key], index) => slugs.set(key, created[index]!));
  return slugs;
}

async function loadFinishedVisitCounts(
  clientUserIds: string[],
  workProfileIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (clientUserIds.length === 0) return counts;
  const rows = await prisma.booking.groupBy({
    by: ["clientUserId"],
    where: {
      ...masterPerformedBookingWhere(workProfileIds),
      clientUserId: { in: clientUserIds },
      status: BookingStatus.FINISHED,
    },
    _count: { _all: true },
  });
  for (const row of rows) {
    if (row.clientUserId) counts.set(row.clientUserId, row._count._all);
  }
  return counts;
}

function toItem(
  row: ItemRow,
  extras: { now: Date; chatSlug: string | null; finishedVisitsCount: number | null },
): MasterBookingItem {
  const services = serviceLines(row);
  const isChangeRequest = row.status === BookingStatus.CHANGE_REQUESTED;
  const actionRequiredBy = row.actionRequiredBy ?? null;
  return {
    id: row.id,
    status: row.status,
    runtimeStatus: resolveBookingRuntimeStatus({
      status: row.status,
      startAtUtc: row.startAtUtc,
      endAtUtc: row.endAtUtc,
      now: extras.now,
    }),
    source: row.source,
    startAtUtc: iso(row.startAtUtc),
    endAtUtc: iso(row.endAtUtc),
    durationMin: durationMinutes(row),
    timezone: row.masterProvider?.timezone ?? row.provider.timezone,
    proposedStartAtUtc: isChangeRequest ? iso(row.proposedStartAt) : null,
    proposedEndAtUtc: isChangeRequest ? iso(row.proposedEndAt) : null,
    requestedBy: row.requestedBy ?? null,
    actionRequiredBy,
    changeComment: row.changeComment,
    needsAnswer: bookingNeedsMasterAnswer({
      status: row.status,
      startAtUtc: row.startAtUtc,
      endAtUtc: row.endAtUtc,
      actionRequiredBy,
      now: extras.now,
    }),
    clientName: row.clientName,
    clientUserId: row.clientUserId,
    clientAvatarUrl: row.clientUserId ? row.clientUser?.externalPhotoUrl ?? null : null,
    finishedVisitsCount: extras.finishedVisitsCount,
    isNewClient: extras.finishedVisitsCount === 0,
    serviceTitle: row.service.title?.trim() || row.service.name,
    services,
    price: services.reduce((sum, line) => sum + line.price, 0),
    bookingPackageId: row.bookingPackageId,
    workContext: resolveBookingWorkContext(row),
    chatSlug: extras.chatSlug,
    actions: resolveMasterBookingActions({
      status: row.status,
      startAtUtc: row.startAtUtc,
      endAtUtc: row.endAtUtc,
      actionRequiredBy,
      requestedBy: row.requestedBy ?? null,
      bookingPackageId: row.bookingPackageId,
      masterChangeRequestsCount: row.masterChangeRequestsCount,
      now: extras.now,
    }),
  };
}

/**
 * Элементы записей по id в ТОМ ЖЕ порядке. Выборка ограничена записями, которые
 * мастер выполняет (`masterPerformedBookingWhere` по всем рабочим профилям), —
 * id из чужого кабинета молча пропадает, как и запись, удалённая между
 * запросами.
 */
export async function loadMasterBookingItems(input: {
  ids: readonly string[];
  workProfileIds: readonly string[];
  now?: Date;
}): Promise<MasterBookingItem[]> {
  const ids = Array.from(new Set(input.ids));
  if (ids.length === 0) return [];
  const now = input.now ?? new Date();

  const rows = await prisma.booking.findMany({
    where: { AND: [{ id: { in: ids } }, masterPerformedBookingWhere(input.workProfileIds)] },
    select: ITEM_SELECT,
  });
  const clientUserIds = Array.from(
    new Set(rows.map((row) => row.clientUserId).filter((id): id is string => Boolean(id))),
  );
  const [slugs, visits] = await Promise.all([
    resolveChatSlugs(rows),
    loadFinishedVisitCounts(clientUserIds, input.workProfileIds),
  ]);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const items: MasterBookingItem[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const chatKey = chatKeyOf(row);
    items.push(
      toItem(row, {
        now,
        chatSlug: chatKey ? slugs.get(chatKey) ?? null : null,
        finishedVisitsCount: row.clientUserId ? visits.get(row.clientUserId) ?? 0 : null,
      }),
    );
  }
  return items;
}

function parseAnswers(value: Prisma.JsonValue | null): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  const answers: Array<{ question: string; answer: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const question = (entry as Record<string, unknown>).questionText;
    const answer = (entry as Record<string, unknown>).answer;
    if (typeof question === "string" && typeof answer === "string" && answer.trim()) {
      answers.push({ question, answer });
    }
  }
  return answers;
}

function clientPhoneOf(row: DetailRow): string | null {
  const raw = row.clientPhoneSnapshot?.trim() || row.clientPhone?.trim() || "";
  if (!raw) return null;
  return normalizeRussianPhone(raw) ?? raw;
}

function clientKeyOf(row: DetailRow, phone: string | null): string | null {
  try {
    return buildClientKey({ clientUserId: row.clientUserId, clientPhone: phone }).key;
  } catch {
    // Ни аккаунта, ни разбираемого телефона — CRM-карточки у такой записи нет.
    return null;
  }
}

/**
 * Карточка одной записи для мастера — всё, что видно в элементе списка, плюс
 * клиент (телефон, ключ CRM), комментарий и ответы клиента, история переносов
 * и отмены, отзыв. `null` — записи нет или её выполняет не этот мастер (403 и
 * 404 не различаются: существование чужой записи не раскрывается).
 */
export async function getMasterBookingDetail(input: {
  bookingId: string;
  workProfiles: MasterWorkProfiles;
  now?: Date;
}): Promise<MasterBookingDetail | null> {
  const now = input.now ?? new Date();
  const row = await prisma.booking.findFirst({
    where: { AND: [{ id: input.bookingId }, masterPerformedBookingWhere(input.workProfiles.allIds)] },
    select: DETAIL_SELECT,
  });
  if (!row) return null;

  const chatKey = chatKeyOf(row);
  const [chatSlug, visits] = await Promise.all([
    chatKey && row.clientUserId
      ? getOrCreateConversationSlug({ providerId: row.providerId, clientUserId: row.clientUserId })
      : Promise.resolve(null),
    row.clientUserId
      ? loadFinishedVisitCounts([row.clientUserId], input.workProfiles.allIds)
      : Promise.resolve(new Map<string, number>()),
  ]);

  const item = toItem(row, {
    now,
    chatSlug,
    finishedVisitsCount: row.clientUserId ? visits.get(row.clientUserId) ?? 0 : null,
  });
  const phone = clientPhoneOf(row);
  const clientKey = clientKeyOf(row, phone);
  const review = row.review && row.review.deletedAt === null ? row.review : null;

  return {
    ...item,
    createdAt: row.createdAt.toISOString(),
    client: {
      name: row.clientName,
      phone,
      userId: row.clientUserId,
      key: clientKey,
      historyToken: clientKey
        ? signClientKeyToken({ clientKey, masterProviderId: input.workProfiles.personalId })
        : null,
    },
    comment: row.comment?.trim() || null,
    silentMode: row.silentMode,
    answers: parseAnswers(row.bookingAnswers),
    clientChangeRequestsCount: row.clientChangeRequestsCount,
    masterChangeRequestsCount: row.masterChangeRequestsCount,
    changeRequestLimit: BOOKING_CHANGE_REQUEST_LIMIT,
    cancelledBy: row.cancelledBy ?? null,
    cancelReason: row.cancelReason,
    cancelledAtUtc: iso(row.cancelledAtUtc),
    review: review
      ? {
          id: encodePublicId(review.id),
          rating: review.rating,
          text: review.text,
          replyText: review.replyText,
          repliedAt: iso(review.repliedAt),
          createdAt: review.createdAt.toISOString(),
          canReply: review.targetType === "provider",
        }
      : null,
  };
}
