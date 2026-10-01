import { prisma } from "@/lib/prisma";

/**
 * WELCOME-DIALOG-01 — человек закрыл приветствие этапа тестирования.
 * Идемпотентно: повторное закрытие (вторая вкладка) дату не переписывает.
 */
export async function markWelcomeSeen(userId: string): Promise<void> {
  await prisma.userProfile.updateMany({
    where: { id: userId, welcomeSeenAt: null },
    data: { welcomeSeenAt: new Date() },
  });
}
