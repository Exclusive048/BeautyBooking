import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

export type TelegramLinkSummary = {
  linked: boolean;
  enabled: boolean;
  chatId: string | null;
};

export async function getTelegramLinkSummary(userId: string): Promise<TelegramLinkSummary> {
  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { chatId: true, isEnabled: true },
  });

  const linked = Boolean(link?.chatId);
  const enabled = linked ? Boolean(link?.isEnabled) : false;

  return {
    linked,
    enabled,
    chatId: link?.chatId ?? null,
  };
}

export async function setTelegramLinkEnabled(
  userId: string,
  enabled: boolean
): Promise<{ enabled: boolean }> {
  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { id: true, chatId: true, isEnabled: true },
  });

  const linked = Boolean(link?.chatId);
  if (!linked && enabled) {
    throw new AppError("Сначала подключите Telegram", 409, "TELEGRAM_NOT_LINKED");
  }

  if (!link) {
    return { enabled: false };
  }

  if (link.isEnabled === enabled) {
    return { enabled };
  }

  const updated = await prisma.telegramLink.update({
    where: { id: link.id },
    data: { isEnabled: enabled },
    select: { isEnabled: true },
  });

  return { enabled: updated.isEnabled };
}
