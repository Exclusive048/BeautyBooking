import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;

  const studio = await prisma.studio.findUnique({
    where: { id: p.id },
    select: { id: true, providerId: true },
  });
  if (!studio) return fail("Studio not found", 404, "STUDIO_NOT_FOUND");

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId: studio.id,
      userId: auth.user.id,
      status: MembershipStatus.ACTIVE,
    },
    select: { id: true, roles: true },
  });

  if (!membership) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  if (membership.roles.includes(StudioRole.OWNER)) {
    return fail("Owner cannot leave studio", 403, "OWNER_CANNOT_LEAVE");
  }

  const canLeave =
    membership.roles.includes(StudioRole.MASTER) ||
    membership.roles.includes(StudioRole.ADMIN);

  if (!canLeave) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  await prisma.$transaction([
    prisma.studioMembership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.LEFT },
    }),
    prisma.provider.updateMany({
      where: {
        ownerUserId: auth.user.id,
        type: ProviderType.MASTER,
        studioId: studio.providerId,
      },
      data: { studioId: null },
    }),
  ]);

  return ok({ left: true });
}
