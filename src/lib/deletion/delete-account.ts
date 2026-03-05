import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/logging/logger";
import { alertWarning } from "@/lib/monitoring";
import { deleteMasterCabinet } from "@/lib/deletion/delete-master";
import { deleteStudioCabinet } from "@/lib/deletion/delete-studio";

const NOTIFICATION_RETENTION_DAYS = 30;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const user = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
    },
  });

  if (!user) {
    throw new AppError("Пользователь не найден", 404, "NOT_FOUND");
  }

  const masterProfile = await prisma.masterProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (masterProfile) {
    await deleteMasterCabinet(userId);
  }

  while (true) {
    const studio = await prisma.studio.findFirst({
      where: {
        OR: [
          { ownerUserId: userId },
          {
            memberships: {
              some: {
                userId,
                status: "ACTIVE",
                roles: { has: "OWNER" },
              },
            },
          },
          {
            studioMembers: {
              some: {
                userId,
                status: "ACTIVE",
                role: "OWNER",
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!studio) break;
    await deleteStudioCabinet(userId);
  }

  const cutoffDate = daysAgo(NOTIFICATION_RETENTION_DAYS);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (user.phone) {
      await tx.otpCode.deleteMany({ where: { phone: user.phone } });
    }

    await Promise.all([
      tx.pushSubscription.deleteMany({ where: { userId } }),
      tx.notification.deleteMany({
        where: { userId, createdAt: { gte: cutoffDate } },
      }),
      tx.telegramLinkToken.deleteMany({ where: { userId } }),
      tx.telegramLink.deleteMany({ where: { userId } }),
      tx.vkLink.deleteMany({ where: { userId } }),
      tx.publicUsernameAlias.deleteMany({ where: { clientUserId: userId } }),
      tx.favorite.deleteMany({ where: { userId } }),
    ]);

    const subscriptions = await tx.userSubscription.findMany({
      where: { userId },
      select: { id: true, _count: { select: { payments: true } } },
    });
    const deletableIds = subscriptions
      .filter((item) => item._count.payments === 0)
      .map((item) => item.id);
    if (deletableIds.length > 0) {
      await tx.userSubscription.deleteMany({ where: { id: { in: deletableIds } } });
    }

    await tx.userProfile.update({
      where: { id: userId },
      data: {
        phone: null,
        email: null,
        displayName: "Удалённый пользователь",
        telegramId: null,
        telegramUsername: null,
        externalPhotoUrl: null,
        avatarFocalX: null,
        avatarFocalY: null,
        firstName: null,
        lastName: null,
        middleName: null,
        birthDate: null,
        address: null,
        geoLat: null,
        geoLng: null,
        publicUsername: null,
        publicUsernameUpdatedAt: null,
        isDeleted: true,
        deletedAt: now,
      },
    });
  });

  logInfo("User account deleted", { userId });
  await alertWarning("User account deleted", { userId });
}
