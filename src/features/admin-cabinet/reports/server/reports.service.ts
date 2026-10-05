import "server-only";

import {
  AdminAuditAction,
  ChatSenderType,
  ContentReportStatus,
  ContentReportTargetType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import {
  EMPTY_ADMIN_AUDIT_CONTEXT,
  type AdminAuditContext,
} from "@/lib/audit/admin-audit-context";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import * as UI_TEXT from "@/lib/ui/text";
import { maskAuthorDisplay } from "@/features/admin-cabinet/reviews/lib/author-mask";
import type {
  AdminReportRow,
  AdminReportStatusTab,
  AdminReportTypeFilter,
  AdminReportsCounts,
  AdminReportsListResponse,
} from "@/features/admin-cabinet/reports/types";

const T = UI_TEXT.adminPanel.reports.target;

/** Срок ответа на жалобу (App Store 1.2 — «в течение 24 часов»). */
export const CONTENT_REPORT_RESPONSE_HOURS = 24;

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const EXCERPT_MAX = 400;

const STATUS_BY_TAB: Record<Exclude<AdminReportStatusTab, "all">, ContentReportStatus> = {
  new: ContentReportStatus.NEW,
  resolved: ContentReportStatus.RESOLVED,
  dismissed: ContentReportStatus.DISMISSED,
};

function overdueBefore(now: Date): Date {
  return new Date(now.getTime() - CONTENT_REPORT_RESPONSE_HOURS * 3_600_000);
}

function excerpt(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX).trimEnd()}…` : trimmed;
}

type UserNameSrc = {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
};

const USER_NAME_SELECT = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
} as const;

function userDisplay(user: UserNameSrc | null | undefined): string {
  if (!user) return maskAuthorDisplay(null);
  const name =
    user.displayName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return maskAuthorDisplay(name || null);
}

function buildWhere(opts: {
  status: AdminReportStatusTab;
  type: AdminReportTypeFilter;
}): Prisma.ContentReportWhereInput {
  return {
    ...(opts.status !== "all" ? { status: STATUS_BY_TAB[opts.status] } : {}),
    ...(opts.type !== "all" ? { targetType: opts.type } : {}),
  };
}

type ReportRow = {
  id: string;
  reporterUserId: string;
  targetType: ContentReportTargetType;
  targetId: string;
  chatMessageId: string | null;
  reason: AdminReportRow["reason"];
  comment: string | null;
  status: ContentReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  reporter: UserNameSrc;
  resolvedBy: UserNameSrc | null;
};

type TargetView = Pick<AdminReportRow, "target" | "offender" | "reviewModerationUrl">;

type ChatParticipants = { masterUser: UserNameSrc | null; clientUser: UserNameSrc | null };
type ChatMessageSrc = { id: string; body: string; senderType: ChatSenderType };

/** Всё, что подгружено для страницы очереди, — живёт ровно один запрос. */
type TargetContext = {
  views: Map<string, TargetView>;
  chatParticipants: Map<string, ChatParticipants>;
  chatMessages: Map<string, ChatMessageSrc>;
};

const MISSING_TARGET: TargetView = {
  target: { title: T.unknown, excerpt: null, imageUrl: null, publicUrl: null, missing: true },
  offender: null,
  reviewModerationUrl: null,
};

function idsOf(rows: ReportRow[], type: ContentReportTargetType): string[] {
  return [...new Set(rows.filter((row) => row.targetType === type).map((row) => row.targetId))];
}

/**
 * Карточки целей одним запросом на тип — без запроса на строку. Отдаёт то,
 * что модератору нужно для решения: что это, текст, автор и куда идти за
 * инструментом (страница на сайте, «Отзывы», «Пользователи»).
 */
async function loadTargetContext(rows: ReportRow[]): Promise<TargetContext> {
  const views = new Map<string, TargetView>();
  const chatParticipants = new Map<string, ChatParticipants>();
  const key = (type: ContentReportTargetType, id: string) => `${type}:${id}`;

  const providerIds = idsOf(rows, ContentReportTargetType.PROVIDER);
  const reviewIds = idsOf(rows, ContentReportTargetType.REVIEW);
  const portfolioIds = idsOf(rows, ContentReportTargetType.PORTFOLIO_ITEM);
  const chatIds = idsOf(rows, ContentReportTargetType.CHAT);
  const offerIds = idsOf(rows, ContentReportTargetType.MODEL_OFFER);
  const messageIds = [
    ...new Set(rows.map((row) => row.chatMessageId).filter((id): id is string => Boolean(id))),
  ];

  const [providers, reviews, portfolio, chats, offers, messages] = await Promise.all([
    providerIds.length
      ? prisma.provider.findMany({
          where: { id: { in: providerIds } },
          select: {
            id: true,
            name: true,
            publicUsername: true,
            isPublished: true,
            owner: { select: USER_NAME_SELECT },
          },
        })
      : [],
    reviewIds.length
      ? prisma.review.findMany({
          where: { id: { in: reviewIds } },
          select: {
            id: true,
            rating: true,
            text: true,
            deletedAt: true,
            author: { select: USER_NAME_SELECT },
            master: { select: { name: true } },
            studio: { select: { provider: { select: { name: true } } } },
          },
        })
      : [],
    portfolioIds.length
      ? prisma.portfolioItem.findMany({
          where: { id: { in: portfolioIds } },
          select: {
            id: true,
            mediaUrl: true,
            caption: true,
            isPublic: true,
            master: {
              select: { name: true, publicUsername: true, owner: { select: USER_NAME_SELECT } },
            },
          },
        })
      : [],
    chatIds.length
      ? prisma.conversationSlug.findMany({
          where: { id: { in: chatIds } },
          select: { id: true, providerId: true, clientUserId: true },
        })
      : [],
    offerIds.length
      ? prisma.modelOffer.findMany({
          where: { id: { in: offerIds } },
          select: {
            id: true,
            publicCode: true,
            dateLocal: true,
            status: true,
            master: {
              select: { name: true, publicUsername: true, owner: { select: USER_NAME_SELECT } },
            },
          },
        })
      : [],
    messageIds.length
      ? prisma.chatMessage.findMany({
          where: { id: { in: messageIds } },
          select: { id: true, body: true, senderType: true },
        })
      : [],
  ]);

  // Участники переписок: мастер (кабинет и его владелец) и клиент.
  const chatProviderIds = [...new Set(chats.map((chat) => chat.providerId))];
  const chatClientIds = [...new Set(chats.map((chat) => chat.clientUserId))];
  const [chatProviders, chatClients] = await Promise.all([
    chatProviderIds.length
      ? prisma.provider.findMany({
          where: { id: { in: chatProviderIds } },
          select: { id: true, name: true, owner: { select: USER_NAME_SELECT } },
        })
      : [],
    chatClientIds.length
      ? prisma.userProfile.findMany({
          where: { id: { in: chatClientIds } },
          select: USER_NAME_SELECT,
        })
      : [],
  ]);
  const chatProviderById = new Map(chatProviders.map((p) => [p.id, p]));
  const chatClientById = new Map(chatClients.map((u) => [u.id, u]));
  const chatMessages = new Map<string, ChatMessageSrc>(messages.map((m) => [m.id, m]));

  for (const provider of providers) {
    views.set(key(ContentReportTargetType.PROVIDER, provider.id), {
      target: {
        title: provider.name,
        excerpt: null,
        imageUrl: null,
        publicUrl: provider.publicUsername ? `/u/${provider.publicUsername}` : null,
        missing: !provider.isPublished,
      },
      offender: provider.owner
        ? { userId: provider.owner.id, display: userDisplay(provider.owner) }
        : null,
      reviewModerationUrl: null,
    });
  }

  for (const review of reviews) {
    const aboutName = review.master?.name ?? review.studio?.provider?.name ?? null;
    views.set(key(ContentReportTargetType.REVIEW, review.id), {
      target: {
        title: T.review(review.rating, aboutName),
        excerpt: excerpt(review.text),
        imageUrl: null,
        publicUrl: null,
        missing: review.deletedAt !== null,
      },
      offender: { userId: review.author.id, display: userDisplay(review.author) },
      reviewModerationUrl: `/admin/reviews?tab=all&q=${encodeURIComponent(review.id)}`,
    });
  }

  for (const item of portfolio) {
    views.set(key(ContentReportTargetType.PORTFOLIO_ITEM, item.id), {
      target: {
        title: T.portfolio(item.master.name),
        excerpt: excerpt(item.caption),
        imageUrl: item.mediaUrl,
        publicUrl: item.master.publicUsername ? `/u/${item.master.publicUsername}` : null,
        missing: !item.isPublic,
      },
      offender: item.master.owner
        ? { userId: item.master.owner.id, display: userDisplay(item.master.owner) }
        : null,
      reviewModerationUrl: null,
    });
  }

  for (const offer of offers) {
    views.set(key(ContentReportTargetType.MODEL_OFFER, offer.id), {
      target: {
        title: T.modelOffer(offer.master.name, offer.dateLocal),
        excerpt: null,
        imageUrl: null,
        publicUrl: `/models/${offer.publicCode}`,
        missing: offer.status === "ARCHIVED",
      },
      offender: offer.master.owner
        ? { userId: offer.master.owner.id, display: userDisplay(offer.master.owner) }
        : null,
      reviewModerationUrl: null,
    });
  }

  // Переписка: вид зависит от строки (кто жаловался, на какое сообщение),
  // поэтому строится в `toRow`; здесь — только данные пары.
  for (const chat of chats) {
    const provider = chatProviderById.get(chat.providerId) ?? null;
    const client = chatClientById.get(chat.clientUserId) ?? null;
    views.set(key(ContentReportTargetType.CHAT, chat.id), {
      target: {
        title: T.chat(provider?.name ?? T.unknown, client ? userDisplay(client) : T.unknown),
        excerpt: null,
        imageUrl: null,
        publicUrl: null,
        missing: false,
      },
      offender: null,
      reviewModerationUrl: null,
    });
    chatParticipants.set(chat.id, {
      masterUser: provider?.owner ?? null,
      clientUser: client,
    });
  }

  return { views, chatParticipants, chatMessages };
}

function chatView(row: ReportRow, base: TargetView, ctx: TargetContext): TargetView {
  const participants = ctx.chatParticipants.get(row.targetId);
  const message = row.chatMessageId ? ctx.chatMessages.get(row.chatMessageId) ?? null : null;

  // Автор нарушения: отправитель сообщения, а без сообщения — другая сторона
  // переписки относительно автора жалобы.
  let offenderUser: UserNameSrc | null = null;
  if (message) {
    offenderUser =
      message.senderType === ChatSenderType.MASTER
        ? participants?.masterUser ?? null
        : message.senderType === ChatSenderType.CLIENT
          ? participants?.clientUser ?? null
          : null;
  } else if (participants) {
    offenderUser =
      participants.clientUser?.id === row.reporterUserId
        ? participants.masterUser
        : participants.clientUser;
  }

  return {
    target: {
      ...base.target,
      excerpt: message ? excerpt(message.body) : T.chatWhole,
      missing: Boolean(row.chatMessageId) && !message,
    },
    offender: offenderUser ? { userId: offenderUser.id, display: userDisplay(offenderUser) } : null,
    reviewModerationUrl: null,
  };
}

function toRow(row: ReportRow, ctx: TargetContext, now: Date): AdminReportRow {
  const base = ctx.views.get(`${row.targetType}:${row.targetId}`) ?? MISSING_TARGET;
  const view =
    row.targetType === ContentReportTargetType.CHAT && base !== MISSING_TARGET
      ? chatView(row, base, ctx)
      : base;
  return {
    id: row.id,
    targetType: row.targetType,
    reason: row.reason,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    isOverdue: row.status === ContentReportStatus.NEW && row.createdAt < overdueBefore(now),
    reporter: { userId: row.reporterUserId, display: userDisplay(row.reporter) },
    target: view.target,
    offender: view.offender,
    reviewModerationUrl: view.reviewModerationUrl,
    resolution: row.resolvedAt
      ? {
          at: row.resolvedAt.toISOString(),
          byDisplay: row.resolvedBy ? userDisplay(row.resolvedBy) : null,
          note: row.resolutionNote,
        }
      : null,
  };
}

/**
 * Очередь жалоб для «Жалоб» админ-панели. Новые — от старых к свежим (кто
 * дольше ждёт ответа, тот наверху: срок — 24 часа), остальные — свежие
 * первыми. Курсор — id последней строки, как в «Отзывах» и «Пользователях».
 */
export async function listAdminContentReports(
  opts: {
    status?: AdminReportStatusTab;
    type?: AdminReportTypeFilter;
    cursor?: string | null;
    pageSize?: number;
    now?: Date;
  } = {},
): Promise<AdminReportsListResponse> {
  const status = opts.status ?? "new";
  const type = opts.type ?? "all";
  const pageSize = Math.min(Math.max(opts.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const now = opts.now ?? new Date();

  const orderBy: Prisma.ContentReportOrderByWithRelationInput[] =
    status === "new"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

  const rows = await prisma.contentReport.findMany({
    where: buildWhere({ status, type }),
    orderBy,
    take: pageSize + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      reporterUserId: true,
      targetType: true,
      targetId: true,
      chatMessageId: true,
      reason: true,
      comment: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      resolutionNote: true,
      reporter: { select: USER_NAME_SELECT },
      resolvedBy: { select: USER_NAME_SELECT },
    },
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  const ctx = await loadTargetContext(page);

  return {
    items: page.map((row) => toRow(row, ctx, now)),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** Счётчики вкладок + просроченные + открытые жалобы на отзывы (они в «Отзывах»). */
export async function getAdminContentReportCounts(now: Date = new Date()): Promise<AdminReportsCounts> {
  const [grouped, overdue, reportedReviews] = await Promise.all([
    prisma.contentReport.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.contentReport.count({
      where: { status: ContentReportStatus.NEW, createdAt: { lt: overdueBefore(now) } },
    }),
    prisma.review.count({ where: { reportedAt: { not: null }, ...ACTIVE_REVIEW_FILTER } }),
  ]);
  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const fresh = byStatus.get(ContentReportStatus.NEW) ?? 0;
  const resolved = byStatus.get(ContentReportStatus.RESOLVED) ?? 0;
  const dismissed = byStatus.get(ContentReportStatus.DISMISSED) ?? 0;
  return {
    new: fresh,
    resolved,
    dismissed,
    all: fresh + resolved + dismissed,
    overdue,
    reportedReviews,
  };
}

export type ContentReportDecision = "RESOLVED" | "DISMISSED";

/**
 * Решение администратора по жалобе: «Принять меры» (RESOLVED, пометка
 * обязательна — что сделано) или «Отклонить» (DISMISSED, пометка по
 * желанию). Только из NEW: повтор по разобранной — 409 CONFLICT. Решение и
 * запись в журнал действий администратора — одной транзакцией; `openKey`
 * обнуляется, и автор может пожаловаться на ту же цель снова.
 */
export async function decideContentReport(input: {
  reportId: string;
  adminUserId: string;
  decision: ContentReportDecision;
  note: string | null;
  context?: AdminAuditContext;
  now?: Date;
}): Promise<{ id: string; status: ContentReportStatus; resolvedAt: string }> {
  const now = input.now ?? new Date();
  const status =
    input.decision === "RESOLVED" ? ContentReportStatus.RESOLVED : ContentReportStatus.DISMISSED;

  return prisma.$transaction(async (tx) => {
    const report = await tx.contentReport.findUnique({
      where: { id: input.reportId },
      select: { id: true, status: true, targetType: true, targetId: true, reason: true },
    });
    if (!report) {
      throw new AppError("Жалоба не найдена.", 404, "NOT_FOUND");
    }

    // Условное обновление: два администратора одновременно — решение одно.
    const updated = await tx.contentReport.updateMany({
      where: { id: report.id, status: ContentReportStatus.NEW },
      data: {
        status,
        resolvedAt: now,
        resolvedByUserId: input.adminUserId,
        resolutionNote: input.note,
        openKey: null,
      },
    });
    if (updated.count === 0) {
      throw new AppError("Жалоба уже разобрана. Обновите страницу.", 409, "CONFLICT");
    }

    await createAdminAuditLog({
      tx,
      adminUserId: input.adminUserId,
      action:
        status === ContentReportStatus.RESOLVED
          ? AdminAuditAction.CONTENT_REPORT_RESOLVED
          : AdminAuditAction.CONTENT_REPORT_DISMISSED,
      targetType: "ContentReport",
      targetId: report.id,
      details: {
        contentType: report.targetType,
        contentId: report.targetId,
        reason: report.reason,
      },
      reason: input.note,
      context: input.context ?? EMPTY_ADMIN_AUDIT_CONTEXT,
    });

    return { id: report.id, status, resolvedAt: now.toISOString() };
  });
}
