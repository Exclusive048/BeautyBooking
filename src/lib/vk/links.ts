import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

export type VkLinkSummary = {
  linked: boolean;
  enabled: boolean;
  username: string | null;
  avatarUrl: string | null;
};

export async function getVkLinkSummary(userId: string): Promise<VkLinkSummary> {
  const link = await prisma.vkLink.findUnique({
    where: { userId },
    select: { vkUserId: true, isEnabled: true, username: true, avatarUrl: true },
  });

  const linked = Boolean(link?.vkUserId);
  const enabled = linked ? Boolean(link?.isEnabled) : false;

  return {
    linked,
    enabled,
    username: link?.username ?? null,
    avatarUrl: link?.avatarUrl ?? null,
  };
}

export async function setVkLinkEnabled(
  userId: string,
  enabled: boolean
): Promise<{ enabled: boolean }> {
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
