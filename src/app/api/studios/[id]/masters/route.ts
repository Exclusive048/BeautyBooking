import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { attachMasterToStudio, detachMasterFromStudio, listStudioMasters } from "@/lib/studios/masters";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { ensureStudioTeamLimit } from "@/lib/studio/team-limits";

const attachSchema = z.object({
  masterProviderId: z.string().min(1),
});

const detachSchema = z.object({
  masterProviderId: z.string().min(1),
});

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAdmin(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = attachSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  // BC-CAP: attaching an already-ACTIVE master consumes a team seat. An
  // inactive/unclaimed master doesn't count toward the ACTIVE-only cap, so gate
  // only when the target is ACTIVE. `p.id` is the studio Provider id; the cap
  // check keys on Studio.id.
  const attachTarget = await prisma.provider.findUnique({
    where: { id: parsed.data.masterProviderId },
    select: { ownerUserId: true, isPublished: true },
  });
  if (attachTarget && isStudioMasterActive(attachTarget)) {
    const studioRow = await prisma.studio.findUnique({
      where: { providerId: p.id },
      select: { id: true },
    });
    if (studioRow) {
      try {
        await ensureStudioTeamLimit(studioRow.id);
      } catch (error) {
        const appError = toAppError(error);
        return fail(appError.message, appError.status, appError.code, appError.details);
      }
    }
  }

  const result = await attachMasterToStudio(p.id, parsed.data.masterProviderId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ master: result.data }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAdmin(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = detachSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await detachMasterFromStudio(p.id, parsed.data.masterProviderId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ master: result.data });
}
