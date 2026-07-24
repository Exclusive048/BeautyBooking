import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { resolveLinkState } from "@/lib/auth/link-state";

export type VkLinkSummary = {
  linked: boolean;
  enabled: boolean;
};

export async function getVkLinkSummary(userId: string): Promise<VkLinkSummary> {
  const link = await prisma.vkLink.findUnique({
    where: { userId },
    select: { vkUserId: true, isEnabled: true },
  });

  // FIX-LINK-STATE-CONSISTENCY-01: single predicate — `linked`=isLinked (identity),
  // `enabled`=isDeliveryEnabled (delivery pref). Same helper the profile DTO uses.
  const state = resolveLinkState({ linkId: link?.vkUserId, isEnabled: link?.isEnabled });
  return { linked: state.isLinked, enabled: state.isDeliveryEnabled };
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
