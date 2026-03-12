import { z } from "zod";
import { MembershipStatus, StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { transferMasterOutOfStudio } from "@/lib/studio/transfer-master";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  transferServices: z.boolean().optional().default(true),
});

async function resolveCurrentStudioForAdmin(userId: string): Promise<{ id: string; providerId: string }> {
  const ownedStudio = await prisma.studio.findFirst({
    where: {
      OR: [{ ownerUserId: userId }, { provider: { ownerUserId: userId } }],
    },
    select: { id: true, providerId: true },
    orderBy: { createdAt: "asc" },
  });
  if (ownedStudio) return ownedStudio;

  const membership = await prisma.studioMembership.findFirst({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN] },
    },
    select: {
      studio: { select: { id: true, providerId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  return membership.studio;
}

type RouteContext = {
  params: Promise<{ memberId: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    if (!params.memberId?.trim()) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const body = await parseBody(req, bodySchema);
    const studio = await resolveCurrentStudioForAdmin(auth.user.id);
    const result = await transferMasterOutOfStudio(
      params.memberId.trim(),
      studio.providerId,
      body.transferServices
    );

    return jsonOk({
      masterId: params.memberId.trim(),
      transferredServices: result.transferredServices,
    });
  } catch (error) {
    const appError = toAppError(error);
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

