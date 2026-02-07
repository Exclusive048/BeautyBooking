import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export async function markMasterBookingsSeen(masterId: string): Promise<{ lastBookingsSeenAt: string }> {
  // AUDIT (badge reset):
  // - реализовано: mark-as-seen обновляет lastBookingsSeenAt и сбрасывает счётчик новых записей на следующих загрузках.
  const provider = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, ownerUserId: true, type: true },
  });
  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }
  if (!provider.ownerUserId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const now = new Date();
  const updated = await prisma.masterProfile.upsert({
    where: { providerId: masterId },
    create: {
      providerId: masterId,
      userId: provider.ownerUserId,
      lastBookingsSeenAt: now,
    },
    update: {
      lastBookingsSeenAt: now,
    },
    select: { lastBookingsSeenAt: true },
  });

  return { lastBookingsSeenAt: updated.lastBookingsSeenAt?.toISOString() ?? now.toISOString() };
}
