import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

const MAX_SUBSCRIPTIONS = 20;

export type HotSlotSubscriptionItem = {
  providerId: string;
  providerName: string;
  providerAvatarUrl: string | null;
  providerPublicUsername: string | null;
  createdAt: string;
};

async function ensureMasterWithHotSlots(providerId: string) {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      type: true,
      discountRule: { select: { isEnabled: true } },
    },
  });

  if (!provider) {
    throw new AppError("Мастер не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  if (provider.type !== ProviderType.MASTER) {
    throw new AppError("Подписка доступна только для мастеров.", 403, "FORBIDDEN_ROLE");
  }

  if (!provider.discountRule?.isEnabled) {
    throw new AppError("Горящие окошки не активны.", 409, "CONFLICT");
  }

  return provider;
}

export async function listHotSlotSubscriptions(userId: string): Promise<HotSlotSubscriptionItem[]> {
  const items = await prisma.hotSlotSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      providerId: true,
      createdAt: true,
      provider: {
        select: {
          name: true,
          avatarUrl: true,
          publicUsername: true,
        },
      },
    },
  });

  return items.map((item) => ({
    providerId: item.providerId,
    providerName: item.provider.name,
    providerAvatarUrl: item.provider.avatarUrl,
    providerPublicUsername: item.provider.publicUsername ?? null,
    createdAt: item.createdAt.toISOString(),
  }));
}

export async function subscribeHotSlots(userId: string, providerId: string) {
  await ensureMasterWithHotSlots(providerId);

  const existing = await prisma.hotSlotSubscription.findUnique({
    where: { userId_providerId: { userId, providerId } },
    select: { providerId: true },
  });
  if (existing) return existing;

  const count = await prisma.hotSlotSubscription.count({ where: { userId } });
  if (count >= MAX_SUBSCRIPTIONS) {
    throw new AppError("Достигнут лимит подписок.", 409, "LIMIT_REACHED");
  }

  return prisma.hotSlotSubscription.create({
    data: { userId, providerId },
    select: { providerId: true },
  });
}

export async function unsubscribeHotSlots(userId: string, providerId: string): Promise<void> {
  await prisma.hotSlotSubscription.deleteMany({ where: { userId, providerId } });
}
