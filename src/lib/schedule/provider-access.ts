import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type ScheduleProviderContext = {
  id: string;
  type: "MASTER" | "STUDIO";
  studioId: string | null;
  ownerUserId: string | null;
};

export function assertScheduleEditable(provider: ScheduleProviderContext): void {
  if (provider.type === "MASTER" && provider.studioId) {
    throw new AppError(
      "Изменения графика для мастера в студии отправляются на согласование.",
      403,
      "FORBIDDEN"
    );
  }
}

export async function resolveScheduleProvider(input: {
  userId: string;
  providerId?: string | null;
}): Promise<ScheduleProviderContext> {
  if (input.providerId) {
    const provider = await prisma.provider.findUnique({
      where: { id: input.providerId },
      select: { id: true, type: true, studioId: true, ownerUserId: true },
    });
    if (!provider || provider.ownerUserId !== input.userId) {
      throw new AppError("Недостаточно прав.", 403, "FORBIDDEN");
    }
    return provider;
  }

  const master = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: "MASTER" },
    select: { id: true, type: true, studioId: true, ownerUserId: true },
    orderBy: { createdAt: "asc" },
  });
  if (master) return master;

  const studio = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: "STUDIO" },
    select: { id: true, type: true, studioId: true, ownerUserId: true },
    orderBy: { createdAt: "asc" },
  });
  if (studio) return studio;

  throw new AppError("Недостаточно прав.", 403, "FORBIDDEN");
}
