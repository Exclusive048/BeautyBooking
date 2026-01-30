import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { rejectStudioInvite } from "@/lib/invites/service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  if (!p.id) return fail("Invite id is required", 400, "VALIDATION_ERROR");

  const result = await rejectStudioInvite(p.id, {
    id: auth.user.id,
    phone: auth.user.phone,
  });

  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ inviteId: result.data.inviteId });
}
