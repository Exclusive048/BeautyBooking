import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { listStudioMasters } from "@/lib/studios/masters";
import { ensureStudioAdmin } from "@/lib/studios/access";

/**
 * SECURITY-EXPOSURE-AUDIT-01 finding #1 (R1b): the `POST` direct-attach handler
 * was removed. It authorized the caller's own studio but then re-parented ANY
 * caller-supplied master (`attachMasterToStudio`'s null-permissive branch), so a
 * throwaway studio could seize a solo master with no consent — and the victim
 * could not leave. It had **no** frontend or server caller: a master only ever
 * joins a studio via the invite flow (`POST /api/studios/[id]/invites` /
 * `POST /api/studio/masters` → `acceptStudioInvite`), which verifies the
 * accepting user's own phone (`hasInvitePhoneAccess`) before calling
 * `attachMasterToStudio` internally. The primitive is intentionally kept for
 * that consented path; only this unconsented HTTP surface is gone.
 *
 * SEC-27: the null-permissive branch this comment describes is gone too. The
 * primitive now asks the DB for a master that is free or already in THIS studio
 * (`OR: [{ studioId: null }, { studioId }]`) and repeats that state in the
 * write's `where`, so the rule can no longer be misread as a branch — nor lost
 * to a race. Consent itself still lives with the invite flow, not the primitive
 * (`STUDIO-ATTACH-CONSENT-CONTRACT` in BACKLOG).
 */

// 29.09 доработки · 04: `DELETE` (отвязка без переноса услуг и отзыва
// приглашений, вызывающих не было) удалён — исключение мастера идёт одним путём,
// `POST /api/cabinet/studio/members/[memberId]/remove`.

async function ensureStudioViewer(studioId: string, userId: string) {
  return ensureStudioAdmin(studioId, userId);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioViewer(p.id, auth.user.id);
  if (accessError) return accessError;

  const result = await listStudioMasters(p.id);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ masters: result.data });
}
