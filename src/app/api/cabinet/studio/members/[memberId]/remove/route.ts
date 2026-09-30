import { z } from "zod";
import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  loadInviteWithRelations,
  notifyStudioInviteRevoked,
  notifyStudioMemberRemoved,
} from "@/lib/notifications/studio-notifications";
import { prisma } from "@/lib/prisma";
import { ensureStudioRole } from "@/lib/studio/access";
import { transferMasterOutOfStudio } from "@/lib/studio/transfer-master";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  /**
   * `Studio.id` студии, выбранной в кабинете. 29.09 доработки · 04: раньше
   * роут брал «первую по `createdAt`» студию пользователя сам, и у того, кто
   * администрирует две студии, удаление уходило не туда (409 STUDIO_MISMATCH).
   */
  studioId: z.string().trim().min(1),
  transferServices: z.boolean().optional().default(true),
});

type RouteContext = {
  params: Promise<{ memberId: string }>;
};

/**
 * Исключение мастера из студии (кабинет студии → «Мастера» → «Удалить из
 * студии»). `memberId` — `Provider.id` профиля мастера В СТУДИИ. Живые записи
 * студии сначала переносятся или отменяются (`findStudioLeaveBlock`, 409
 * `MASTER_HAS_STUDIO_BOOKINGS`). Владелец может исключить и себя-мастера
 * (решение владельца 2026-09-29) — тогда уведомление самому себе не уходит.
 */
export async function POST(req: Request, ctx: RouteContext) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const memberId = params.memberId?.trim();
    if (!memberId) {
      return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
    }

    const body = await parseBody(req, bodySchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: auth.user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });
    const studio = await prisma.studio.findUnique({
      where: { id: body.studioId },
      select: { providerId: true, provider: { select: { name: true } } },
    });
    if (!studio) return jsonFail(404, "Студия не найдена.", "STUDIO_NOT_FOUND");

    const member = await prisma.provider.findUnique({
      where: { id: memberId },
      select: { ownerUserId: true },
    });

    const result = await transferMasterOutOfStudio(
      memberId,
      studio.providerId,
      body.transferServices,
      "STUDIO",
    );

    for (const inviteId of result.revokedInviteIds) {
      try {
        const invite = await loadInviteWithRelations(inviteId);
        if (invite) await notifyStudioInviteRevoked(invite);
      } catch (error) {
        logError("POST /api/cabinet/studio/members/[memberId]/remove invite-revoke notify failed", {
          requestId: getRequestId(req),
          route: "POST /api/cabinet/studio/members/{memberId}/remove",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    const masterUserId = member?.ownerUserId ?? null;
    if (masterUserId && masterUserId !== auth.user.id) {
      try {
        await notifyStudioMemberRemoved({ masterUserId, studioName: studio.provider.name });
      } catch (error) {
        logError("POST /api/cabinet/studio/members/[memberId]/remove member-removed notify failed", {
          requestId: getRequestId(req),
          route: "POST /api/cabinet/studio/members/{memberId}/remove",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    return jsonOk({
      masterId: memberId,
      transferredServices: result.transferredServices,
      revokedInvites: result.revokedInviteIds.length,
      alreadyLeft: false,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (
      appError.code === "CONFLICT" &&
      typeof appError.details === "object" &&
      appError.details !== null &&
      (appError.details as { reason?: string }).reason === "ALREADY_LEFT_STUDIO"
    ) {
      const params = await ctx.params;
      return jsonOk({
        masterId: params.memberId.trim(),
        transferredServices: 0,
        revokedInvites: 0,
        alreadyLeft: true,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
