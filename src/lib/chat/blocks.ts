import "server-only";

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { resolveConversationAccess } from "@/lib/chat/conversation-access";
import type { ConversationKey } from "@/lib/chat/conversation-slug";

/**
 * MOBILE-POLISH (App Store 1.2) — блокировка в переписке.
 *
 * Блок ставится на уровне ЛЮДЕЙ: клиент ↔ владелец кабинета мастера
 * (`Provider.ownerUserId`), а не на одну пару (кабинет, клиент). Пока он
 * есть, переписка закрыта в ОБЕ стороны во всех их переписках: заблокированный
 * не может написать заблокировавшему, а заблокировавший — пока не снимет блок
 * (симметричное «переписка закрыта»). Снять блок может только тот, кто его
 * поставил. Записи, их подтверждение и отмена блок не трогает — только чат;
 * служебные сообщения о записи (`system-messages.ts`) тоже идут как раньше.
 */

export const CHAT_BLOCKED_BY_OTHER_MESSAGE = "Собеседник ограничил переписку с вами.";
export const CHAT_BLOCKED_BY_ME_MESSAGE = "Вы заблокировали собеседника. Разблокируйте, чтобы написать.";

export type ChatBlockState = {
  /** Я заблокировал собеседника. */
  blockedByMe: boolean;
  /** Собеседник заблокировал меня. */
  blockedByOther: boolean;
};

const NO_BLOCK: ChatBlockState = { blockedByMe: false, blockedByOther: false };

/** Есть ли блок между двумя людьми — в любую сторону, глазами `viewerUserId`. */
export async function getChatBlockState(
  viewerUserId: string,
  otherUserId: string | null | undefined,
): Promise<ChatBlockState> {
  if (!otherUserId || otherUserId === viewerUserId) return NO_BLOCK;
  const rows = await prisma.chatBlock.findMany({
    where: {
      OR: [
        { blockerUserId: viewerUserId, blockedUserId: otherUserId },
        { blockerUserId: otherUserId, blockedUserId: viewerUserId },
      ],
    },
    select: { blockerUserId: true },
  });
  return {
    blockedByMe: rows.some((row) => row.blockerUserId === viewerUserId),
    blockedByOther: rows.some((row) => row.blockerUserId === otherUserId),
  };
}

/** Состояние блока с каждым из собеседников — одним запросом (список переписок). */
export async function getChatBlockStates(
  viewerUserId: string,
  otherUserIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, ChatBlockState>> {
  const others = [
    ...new Set(otherUserIds.filter((id): id is string => Boolean(id) && id !== viewerUserId)),
  ];
  const states = new Map<string, ChatBlockState>();
  if (others.length === 0) return states;
  const rows = await prisma.chatBlock.findMany({
    where: {
      OR: [
        { blockerUserId: viewerUserId, blockedUserId: { in: others } },
        { blockedUserId: viewerUserId, blockerUserId: { in: others } },
      ],
    },
    select: { blockerUserId: true, blockedUserId: true },
  });
  for (const row of rows) {
    const byMe = row.blockerUserId === viewerUserId;
    const other = byMe ? row.blockedUserId : row.blockerUserId;
    const current = states.get(other) ?? { ...NO_BLOCK };
    if (byMe) current.blockedByMe = true;
    else current.blockedByOther = true;
    states.set(other, current);
  }
  return states;
}

/**
 * Отказ отправки при блоке — 403 `CHAT_BLOCKED`. Текст — с точки зрения
 * отправителя: его заблокировали или он сам заблокировал собеседника.
 */
export async function assertChatNotBlocked(
  senderUserId: string,
  recipientUserId: string | null | undefined,
): Promise<void> {
  const state = await getChatBlockState(senderUserId, recipientUserId);
  if (state.blockedByOther) {
    throw new AppError(CHAT_BLOCKED_BY_OTHER_MESSAGE, 403, "CHAT_BLOCKED");
  }
  if (state.blockedByMe) {
    throw new AppError(CHAT_BLOCKED_BY_ME_MESSAGE, 403, "CHAT_BLOCKED");
  }
}

/** Причина закрытой переписки для ответа (`null` — блока нет). */
export function chatBlockReason(state: ChatBlockState): string | null {
  if (state.blockedByOther) return CHAT_BLOCKED_BY_OTHER_MESSAGE;
  if (state.blockedByMe) return CHAT_BLOCKED_BY_ME_MESSAGE;
  return null;
}

/**
 * Собеседник в переписке глазами участника: мастер видит клиента, клиент —
 * владельца кабинета мастера. `null` — у кабинета нет владельца.
 */
export async function resolveConversationCounterpart(
  key: ConversationKey,
  viewerUserId: string,
): Promise<{ otherUserId: string | null; viewerIsMaster: boolean }> {
  const provider = await prisma.provider.findUnique({
    where: { id: key.providerId },
    select: { ownerUserId: true },
  });
  const viewerIsMaster = provider?.ownerUserId === viewerUserId;
  return {
    otherUserId: viewerIsMaster ? key.clientUserId : (provider?.ownerUserId ?? null),
    viewerIsMaster,
  };
}

/** Состояние блока для экрана переписки. */
export async function getConversationBlockState(
  key: ConversationKey,
  viewerUserId: string,
): Promise<ChatBlockState> {
  const { otherUserId } = await resolveConversationCounterpart(key, viewerUserId);
  return getChatBlockState(viewerUserId, otherUserId);
}

async function requireParticipantCounterpart(
  key: ConversationKey | null,
  userId: string,
): Promise<{ key: ConversationKey; otherUserId: string }> {
  if (!key) throw new AppError("Переписка не найдена.", 404, "NOT_FOUND");
  const access = await resolveConversationAccess({ key, userId });
  if (!access.ok) {
    if (access.reason === "not-found") throw new AppError("Переписка не найдена.", 404, "NOT_FOUND");
    throw new AppError("Эта переписка вам недоступна.", 403, "FORBIDDEN");
  }
  const { otherUserId } = await resolveConversationCounterpart(key, userId);
  if (!otherUserId) throw new AppError("Переписка не найдена.", 404, "NOT_FOUND");
  if (otherUserId === userId) {
    throw new AppError("Нельзя заблокировать самого себя.", 400, "VALIDATION_ERROR");
  }
  return { key, otherUserId };
}

/** Заблокировать собеседника переписки. Повтор — то же состояние (идемпотентно). */
export async function blockConversationCounterpart(input: {
  key: ConversationKey | null;
  userId: string;
}): Promise<ChatBlockState> {
  const { key, otherUserId } = await requireParticipantCounterpart(input.key, input.userId);
  await prisma.chatBlock.upsert({
    where: { blockerUserId_blockedUserId: { blockerUserId: input.userId, blockedUserId: otherUserId } },
    create: {
      blockerUserId: input.userId,
      blockedUserId: otherUserId,
      providerId: key.providerId,
      clientUserId: key.clientUserId,
    },
    update: {},
  });
  return getChatBlockState(input.userId, otherUserId);
}

/** Снять свой блок с собеседника переписки. Блока нет — то же состояние. */
export async function unblockConversationCounterpart(input: {
  key: ConversationKey | null;
  userId: string;
}): Promise<ChatBlockState> {
  const { otherUserId } = await requireParticipantCounterpart(input.key, input.userId);
  await prisma.chatBlock.deleteMany({
    where: { blockerUserId: input.userId, blockedUserId: otherUserId },
  });
  return getChatBlockState(input.userId, otherUserId);
}

export type MyChatBlockItem = {
  id: string;
  createdAt: string;
  /** Кого заблокировали: имя и фото — ничего больше (ни телефона, ни id). */
  name: string;
  avatarUrl: string | null;
};

const CLIENT_FALLBACK_NAME = "Клиент";
const MASTER_FALLBACK_NAME = "Мастер";

/** «Заблокированные»: кого заблокировал я, свежие первыми. */
export async function listMyChatBlocks(userId: string): Promise<MyChatBlockItem[]> {
  const blocks = await prisma.chatBlock.findMany({
    where: { blockerUserId: userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      createdAt: true,
      blockedUserId: true,
      providerId: true,
      clientUserId: true,
      blocked: {
        select: { displayName: true, firstName: true, lastName: true, externalPhotoUrl: true },
      },
    },
  });

  // Заблокирован мастер (не клиент переписки) — показываем его кабинет: имя
  // и фото, под которыми клиент его знает.
  const providerIds = [
    ...new Set(blocks.filter((b) => b.blockedUserId !== b.clientUserId).map((b) => b.providerId)),
  ];
  const providers = providerIds.length
    ? await prisma.provider.findMany({
        where: { id: { in: providerIds } },
        select: { id: true, name: true, avatarUrl: true },
      })
    : [];
  const providerById = new Map(providers.map((p) => [p.id, p]));

  return blocks.map((block) => {
    const userName =
      block.blocked.displayName?.trim() ||
      [block.blocked.firstName, block.blocked.lastName].filter(Boolean).join(" ").trim();
    if (block.blockedUserId === block.clientUserId) {
      return {
        id: block.id,
        createdAt: block.createdAt.toISOString(),
        name: userName || CLIENT_FALLBACK_NAME,
        avatarUrl: block.blocked.externalPhotoUrl ?? null,
      };
    }
    const provider = providerById.get(block.providerId);
    return {
      id: block.id,
      createdAt: block.createdAt.toISOString(),
      name: provider?.name ?? (userName || MASTER_FALLBACK_NAME),
      avatarUrl: provider?.avatarUrl ?? null,
    };
  });
}

/** Снять блок из списка «Заблокированные». Чужой или несуществующий — 404. */
export async function removeMyChatBlock(userId: string, blockId: string): Promise<void> {
  const removed = await prisma.chatBlock.deleteMany({
    where: { id: blockId, blockerUserId: userId },
  });
  if (removed.count === 0) {
    throw new AppError("Не удалось найти блокировку. Обновите список.", 404, "NOT_FOUND");
  }
}
