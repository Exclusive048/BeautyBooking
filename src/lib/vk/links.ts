import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { resolveLinkState } from "@/lib/auth/link-state";
import { getVkCommunity } from "@/lib/vk/community";
import { isMessagesFromCommunityAllowed } from "@/lib/vk/community-api";

export type VkLinkSummary = {
  linked: boolean;
  enabled: boolean;
};

/**
 * VK-COMMUNITY-NOTIFY-01 — состояние для секции «Уведомления ВКонтакте» в
 * общих настройках.
 *  · `available` — сообщество настроено в админке; нет — канала нет вовсе.
 *  · `messagesAllowed` — разрешил ли человек сообщения от сообщества (без
 *    этого VK не пропустит ни одного уведомления). `null` — спросить VK не
 *    удалось; интерфейс тогда не утверждает ни того, ни другого.
 *  · `chatUrl` — куда вести кнопку «Разрешить сообщения».
 */
export type VkNotificationStatus = VkLinkSummary & {
  available: boolean;
  messagesAllowed: boolean | null;
  chatUrl: string | null;
};

export async function getVkNotificationStatus(userId: string): Promise<VkNotificationStatus> {
  const [link, community] = await Promise.all([
    prisma.vkLink.findUnique({ where: { userId }, select: { vkUserId: true, isEnabled: true } }),
    getVkCommunity(),
  ]);
  // FIX-LINK-STATE-CONSISTENCY-01: single predicate — `linked`=isLinked (identity),
  // `enabled`=isDeliveryEnabled (delivery pref). Same helper the profile DTO uses.
  const state = resolveLinkState({ linkId: link?.vkUserId, isEnabled: link?.isEnabled });

  let messagesAllowed: boolean | null = null;
  if (community && state.isLinked && link?.vkUserId) {
    const allowed = await isMessagesFromCommunityAllowed(community.token, {
      groupId: community.groupId,
      vkUserId: link.vkUserId,
    });
    messagesAllowed = allowed.ok ? allowed.data : null;
  }

  return {
    linked: state.isLinked,
    enabled: state.isDeliveryEnabled,
    available: community !== null,
    messagesAllowed,
    chatUrl: community?.chatUrl ?? null,
  };
}

export async function setVkLinkEnabled(userId: string, enabled: boolean): Promise<{ enabled: boolean }> {
  const link = await prisma.vkLink.findUnique({
    where: { userId },
    select: { id: true, vkUserId: true, isEnabled: true },
  });

  const linked = Boolean(link?.vkUserId);
  if (!linked && enabled) {
    throw new AppError("Сначала подключите VK", 409, "VK_NOT_LINKED");
  }

  if (!link) {
    return { enabled: false };
  }

  if (link.isEnabled === enabled) {
    return { enabled };
  }

  const updated = await prisma.vkLink.update({
    where: { id: link.id },
    data: { isEnabled: enabled },
    select: { isEnabled: true },
  });

  return { enabled: updated.isEnabled };
}
