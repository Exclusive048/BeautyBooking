import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import {
  loadInviteWithRelations,
  notifyStudioInviteRevoked,
  notifyStudioMemberLeft,
} from "@/lib/notifications/studio-notifications";
import { prisma } from "@/lib/prisma";
import { transferMasterOutOfStudio } from "@/lib/studio/transfer-master";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  transferServices: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const body = await parseBody(req, bodySchema);
    const masterId = await getCurrentMasterProviderId(auth.user.id);
    const master = await prisma.provider.findUnique({
      where: { id: masterId },
      select: { studioId: true, name: true },
    });
    if (!master?.studioId) {
      return jsonOk({ transferredServices: 0, alreadyLeft: true });
    }

    const studio = await prisma.studio.findUnique({
      where: { providerId: master.studioId },
      select: {
        ownerUserId: true,
        provider: { select: { name: true, ownerUserId: true } },
      },
    });

    const result = await transferMasterOutOfStudio(masterId, master.studioId, body.transferServices);

    if (result.revokedInviteIds.length > 0) {
      for (const inviteId of result.revokedInviteIds) {
        try {
          const invite = await loadInviteWithRelations(inviteId);
          if (invite) {
            await notifyStudioInviteRevoked(invite);
          }
        } catch (error) {
          logError("POST /api/cabinet/master/leave-studio invite-revoke notify failed", {
            requestId: getRequestId(req),
            route: "POST /api/cabinet/master/leave-studio",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      }
    }

    const studioOwnerUserId = studio?.ownerUserId ?? studio?.provider.ownerUserId ?? null;
    if (studioOwnerUserId) {
      try {
        await notifyStudioMemberLeft({
          studioOwnerUserId,
          masterName: master.name || "Мастер",
          studioName: studio?.provider.name || "Студия",
        });
      } catch (error) {
        logError("POST /api/cabinet/master/leave-studio member-left notify failed", {
          requestId: getRequestId(req),
          route: "POST /api/cabinet/master/leave-studio",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    return jsonOk({ transferredServices: result.transferredServices, alreadyLeft: false });
  } catch (error) {
    const appError = toAppError(error);
    if (
      appError.code === "CONFLICT" &&
      typeof appError.details === "object" &&
      appError.details !== null &&
      (appError.details as { reason?: string }).reason === "ALREADY_LEFT_STUDIO"
    ) {
      return jsonOk({ transferredServices: 0, alreadyLeft: true });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

