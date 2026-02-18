import { AppError } from "@/lib/api/errors";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createLimitReachedError } from "@/lib/billing/guards";
import { prisma } from "@/lib/prisma";

export async function ensureStudioTeamLimit(userId: string, studioId: string): Promise<void> {
  const plan = await getCurrentPlan(userId);
  const maxTeamMasters = plan.features.maxTeamMasters;
  if (maxTeamMasters === null) return;

  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const [mastersCount, invitesCount] = await Promise.all([
    prisma.provider.count({
      where: { type: "MASTER", studioId: studio.providerId },
    }),
    prisma.studioInvite.count({
      where: { studioId: studio.id, status: "PENDING" },
    }),
  ]);

  const current = mastersCount + invitesCount;
  if (current >= maxTeamMasters) {
    throw createLimitReachedError("maxTeamMasters", maxTeamMasters, current);
  }
}
