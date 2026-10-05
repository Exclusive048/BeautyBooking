import "server-only";

import {
  ChatSenderType,
  ContentReportReason,
  ContentReportStatus,
  ContentReportTargetType,
  ModelOfferStatus,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { decodePublicId } from "@/lib/public-id";
import { canonicalPublicProviderKey } from "@/lib/providers/resolve-public-provider";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { resolveConversationAccess } from "@/lib/chat/conversation-access";
import { MODEL_OFFER_VISIBLE_MASTER_WHERE } from "@/lib/model-offers/visibility";

/**
 * MOBILE-POLISH (App Store 1.2) — жалоба любого вошедшего пользователя на
 * чужой контент.
 *
 * Цель приходит ПУБЛИЧНЫМ идентификатором — тем, что клиент уже держит на
 * экране:
 *   - PROVIDER        — адрес страницы (`publicUsername`, старый адрес) или id
 *                       провайдера, как в `/u/{key}`;
 *   - REVIEW          — `id` отзыва из публичного списка (`e_…`, сырой cuid
 *                       тоже принимается — `decodePublicId`);
 *   - PORTFOLIO_ITEM  — `id` работы из ленты (`e_…`);
 *   - CHAT            — slug переписки, по желанию `messageId` сообщения в ней;
 *   - MODEL_OFFER     — `publicCode` предложения для моделей.
 * Здесь он превращается во внутренний id, и в базе лежит уже он.
 *
 * Правила:
 *   - цель не существует или не видна автору жалобы — 404 (одинаковый ответ,
 *     существование скрытого не раскрывается); переписка — только участнику;
 *   - свой контент (своя страница, свой отзыв, своя работа, своё предложение,
 *     своё сообщение) — 400 `REPORT_OWN_CONTENT`;
 *   - одна ОТКРЫТАЯ жалоба автора на цель: повтор, пока жалоба NEW, —
 *     `alreadyReported: true` с id существующей, без дубля (держит
 *     уникальный `openKey`, гонку двух запросов разрешает он же).
 */

export const CONTENT_REPORT_TARGET_TYPES = [
  "PROVIDER",
  "REVIEW",
  "PORTFOLIO_ITEM",
  "CHAT",
  "MODEL_OFFER",
] as const satisfies readonly ContentReportTargetType[];

export const CONTENT_REPORT_REASONS = [
  "SPAM",
  "OFFENSIVE",
  "FRAUD",
  "INAPPROPRIATE_CONTENT",
  "OTHER",
] as const satisfies readonly ContentReportReason[];

export const CONTENT_REPORT_COMMENT_MAX = 1000;

const OTHER_COMMENT_REQUIRED = "Опишите, что не так: для причины «Другое» нужен комментарий.";

export const createContentReportSchema = z
  .object({
    targetType: z.enum(CONTENT_REPORT_TARGET_TYPES, {
      error: "Укажите, на что вы жалуетесь.",
    }),
    targetId: z
      .string({ error: "Укажите, на что вы жалуетесь." })
      .trim()
      .min(1, "Укажите, на что вы жалуетесь.")
      .max(200, "Не удалось найти то, на что вы жалуетесь. Обновите страницу."),
    messageId: z
      .string()
      .trim()
      .min(1, "Не удалось найти сообщение. Обновите переписку.")
      .max(200, "Не удалось найти сообщение. Обновите переписку.")
      .optional(),
    reason: z.enum(CONTENT_REPORT_REASONS, { error: "Выберите причину жалобы." }),
    comment: z
      .string()
      .trim()
      .max(CONTENT_REPORT_COMMENT_MAX, `Комментарий — не длиннее ${CONTENT_REPORT_COMMENT_MAX} символов.`)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === "OTHER" && !value.comment) {
      ctx.addIssue({ code: "custom", path: ["comment"], message: OTHER_COMMENT_REQUIRED });
    }
    if (value.messageId && value.targetType !== "CHAT") {
      ctx.addIssue({
        code: "custom",
        path: ["messageId"],
        message: "Сообщение указывается только в жалобе на переписку.",
      });
    }
  });

export type CreateContentReportInput = z.infer<typeof createContentReportSchema>;

type ResolvedTarget = {
  targetId: string;
  targetProviderId: string | null;
  chatMessageId: string | null;
};

const NOT_FOUND_MESSAGES: Record<ContentReportTargetType, string> = {
  PROVIDER: "Страница не найдена.",
  REVIEW: "Отзыв не найден.",
  PORTFOLIO_ITEM: "Работа не найдена.",
  CHAT: "Переписка не найдена.",
  MODEL_OFFER: "Предложение не найдено.",
};

function notFound(type: ContentReportTargetType, message?: string): AppError {
  return new AppError(message ?? NOT_FOUND_MESSAGES[type], 404, "NOT_FOUND");
}

function ownContent(): AppError {
  return new AppError("На свой контент пожаловаться нельзя.", 400, "REPORT_OWN_CONTENT");
}

/** Владеет ли пользователь кабинетом: сам кабинет или студия, чей это профиль. */
function ownsProvider(
  provider: { ownerUserId: string | null; studioProfile: { ownerUserId: string | null } | null } | null,
  userId: string,
): boolean {
  if (!provider) return false;
  return provider.ownerUserId === userId || provider.studioProfile?.ownerUserId === userId;
}

const OWNER_SELECT = {
  id: true,
  ownerUserId: true,
  studioProfile: { select: { ownerUserId: true } },
} as const;

async function resolveProviderTarget(rawKey: string, userId: string): Promise<ResolvedTarget> {
  const key = await canonicalPublicProviderKey(rawKey);
  const provider = await resolveProviderBySlugOrId({
    key,
    requirePublished: true,
    select: OWNER_SELECT,
  });
  if (!provider) throw notFound("PROVIDER");
  if (ownsProvider(provider, userId)) throw ownContent();
  return { targetId: provider.id, targetProviderId: provider.id, chatMessageId: null };
}

async function resolveReviewTarget(publicId: string, userId: string): Promise<ResolvedTarget> {
  const review = await prisma.review.findFirst({
    // Удалённый (soft-delete) отзыв не виден никому — инв. #17.
    where: { id: decodePublicId(publicId), ...ACTIVE_REVIEW_FILTER },
    select: {
      id: true,
      authorId: true,
      masterId: true,
      studio: { select: { providerId: true } },
    },
  });
  if (!review) throw notFound("REVIEW");
  if (review.authorId === userId) throw ownContent();
  return {
    targetId: review.id,
    targetProviderId: review.masterId ?? review.studio?.providerId ?? null,
    chatMessageId: null,
  };
}

async function resolvePortfolioTarget(publicId: string, userId: string): Promise<ResolvedTarget> {
  const item = await prisma.portfolioItem.findUnique({
    where: { id: decodePublicId(publicId) },
    select: {
      id: true,
      isPublic: true,
      master: { select: { ...OWNER_SELECT, isPublished: true } },
      performer: { select: OWNER_SELECT },
    },
  });
  // Та же видимость, что у `GET /api/feed/portfolio/{id}`: скрытая работа и
  // работа неопубликованного кабинета — одинаковый 404.
  if (!item || !item.isPublic || !item.master.isPublished) throw notFound("PORTFOLIO_ITEM");
  if (ownsProvider(item.master, userId) || ownsProvider(item.performer, userId)) throw ownContent();
  return { targetId: item.id, targetProviderId: item.master.id, chatMessageId: null };
}

async function resolveModelOfferTarget(code: string, userId: string): Promise<ResolvedTarget> {
  const offer = await prisma.modelOffer.findFirst({
    // Мастер виден так же, как в публичном списке; закрытое предложение
    // ещё можно обжаловать (его видели), архивное — уже нет.
    where: {
      publicCode: code,
      status: { not: ModelOfferStatus.ARCHIVED },
      master: MODEL_OFFER_VISIBLE_MASTER_WHERE,
    },
    select: { id: true, master: { select: OWNER_SELECT } },
  });
  if (!offer) throw notFound("MODEL_OFFER");
  if (ownsProvider(offer.master, userId)) throw ownContent();
  return { targetId: offer.id, targetProviderId: offer.master.id, chatMessageId: null };
}

async function resolveChatTarget(
  slug: string,
  messageId: string | undefined,
  userId: string,
): Promise<ResolvedTarget> {
  const record = await prisma.conversationSlug.findUnique({
    where: { slug },
    select: { id: true, providerId: true, clientUserId: true },
  });
  if (!record) throw notFound("CHAT");

  const key = { providerId: record.providerId, clientUserId: record.clientUserId };
  const access = await resolveConversationAccess({ key, userId });
  // Не участник — тот же 404: факт чужой переписки не раскрывается.
  if (!access.ok) throw notFound("CHAT");

  const provider = await prisma.provider.findUnique({
    where: { id: record.providerId },
    select: { ownerUserId: true },
  });
  // Клиент записан сам к себе — жаловаться не на кого.
  if (provider?.ownerUserId && provider.ownerUserId === record.clientUserId) throw ownContent();

  if (!messageId) {
    return { targetId: record.id, targetProviderId: record.providerId, chatMessageId: null };
  }

  const message = await prisma.chatMessage.findFirst({
    where: {
      id: decodePublicId(messageId),
      chat: { booking: { providerId: record.providerId, clientUserId: record.clientUserId } },
    },
    select: { id: true, senderType: true },
  });
  if (!message) throw notFound("CHAT", "Сообщение не найдено.");
  if (message.senderType === ChatSenderType.SYSTEM) {
    throw new AppError("На служебное сообщение пожаловаться нельзя.", 400, "VALIDATION_ERROR");
  }
  const mySenderType = access.perspective === "MASTER" ? ChatSenderType.MASTER : ChatSenderType.CLIENT;
  if (message.senderType === mySenderType) throw ownContent();

  return { targetId: record.id, targetProviderId: record.providerId, chatMessageId: message.id };
}

/** Публичный идентификатор цели → внутренний id (+ провайдер, сообщение). */
export async function resolveContentReportTarget(input: {
  targetType: ContentReportTargetType;
  targetId: string;
  messageId?: string;
  reporterUserId: string;
}): Promise<ResolvedTarget> {
  switch (input.targetType) {
    case ContentReportTargetType.PROVIDER:
      return resolveProviderTarget(input.targetId, input.reporterUserId);
    case ContentReportTargetType.REVIEW:
      return resolveReviewTarget(input.targetId, input.reporterUserId);
    case ContentReportTargetType.PORTFOLIO_ITEM:
      return resolvePortfolioTarget(input.targetId, input.reporterUserId);
    case ContentReportTargetType.CHAT:
      return resolveChatTarget(input.targetId, input.messageId, input.reporterUserId);
    case ContentReportTargetType.MODEL_OFFER:
      return resolveModelOfferTarget(input.targetId, input.reporterUserId);
  }
}

/** Ключ «одной открытой жалобы автора на цель». */
export function buildContentReportOpenKey(input: {
  reporterUserId: string;
  targetType: ContentReportTargetType;
  targetId: string;
}): string {
  return `${input.reporterUserId}:${input.targetType}:${input.targetId}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export type CreateContentReportResult = { id: string; alreadyReported: boolean };

export async function createContentReport(
  input: CreateContentReportInput & { reporterUserId: string },
): Promise<CreateContentReportResult> {
  const target = await resolveContentReportTarget({
    targetType: input.targetType,
    targetId: input.targetId,
    messageId: input.messageId,
    reporterUserId: input.reporterUserId,
  });

  const openKey = buildContentReportOpenKey({
    reporterUserId: input.reporterUserId,
    targetType: input.targetType,
    targetId: target.targetId,
  });

  const existing = await prisma.contentReport.findUnique({
    where: { openKey },
    select: { id: true },
  });
  if (existing) return { id: existing.id, alreadyReported: true };

  try {
    const created = await prisma.contentReport.create({
      data: {
        reporterUserId: input.reporterUserId,
        targetType: input.targetType,
        targetId: target.targetId,
        targetProviderId: target.targetProviderId,
        chatMessageId: target.chatMessageId,
        reason: input.reason,
        comment: input.comment ? input.comment : null,
        status: ContentReportStatus.NEW,
        openKey,
      },
      select: { id: true },
    });
    return { id: created.id, alreadyReported: false };
  } catch (error) {
    // Два одновременных запроса: второй упирается в уникальный `openKey` —
    // отвечаем так же, как на повтор.
    if (isUniqueViolation(error)) {
      const winner = await prisma.contentReport.findUnique({
        where: { openKey },
        select: { id: true },
      });
      if (winner) return { id: winner.id, alreadyReported: true };
    }
    throw error;
  }
}
