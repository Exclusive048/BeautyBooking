import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { acceptStudioInvite } from "@/lib/invites/service";
import { loadInviteWithRelations, notifyStudioInviteAccepted } from "@/lib/notifications/studio-notifications";
import { getRequestId, logError } from "@/lib/logging/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  if (!p.id) return fail("Invite id is required", 400, "VALIDATION_ERROR");

  const result = await acceptStudioInvite(p.id, {
    id: auth.user.id,
    phone: auth.user.phone,
    roles: auth.user.roles,
  });

  if (!result.ok) return fail(result.message, result.status, result.code);

  try {
    const invite = await loadInviteWithRelations(result.data.inviteId);
    if (invite) {
      await notifyStudioInviteAccepted(invite);
    }
  } catch (error) {
    logError("POST /api/invites/[id]/accept notification failed", {
      requestId: getRequestId(req),
      route: "POST /api/invites/{id}/accept",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return ok({
    inviteId: result.data.inviteId,
    studioId: result.data.studioId,
    memberId: result.data.memberId,
  });
}
