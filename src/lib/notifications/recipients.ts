import { prisma } from "@/lib/prisma";

export async function getTelegramChatIdForUser(userId: string): Promise<string | null> {
  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { chatId: true, isEnabled: true },
  });

  if (!link?.chatId) return null;
  if (!link.isEnabled) return null;
  return link.chatId;
}
