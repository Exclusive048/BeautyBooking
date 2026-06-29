import { prisma } from "@/lib/prisma";
import { getTelegramEnabled } from "@/lib/telegram/feature";

export async function getTelegramChatIdForUser(userId: string): Promise<string | null> {
  // FIX-TELEGRAM-KILLSWITCH: the single delivery chokepoint. When user-facing
  // Telegram is disabled (env hard ceiling, or admin toggle below it) no user
  // ever resolves a chatId → every enqueue path (delivery.ts /
  // bookingTelegramService.ts / admin-initiated.ts) skips. Other channels
  // (email/push/SMS) are untouched.
  if (!(await getTelegramEnabled())) return null;

  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { chatId: true, isEnabled: true },
  });

  if (!link?.chatId) return null;
  if (!link.isEnabled) return null;
  return link.chatId;
}
