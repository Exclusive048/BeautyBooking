import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { notifyStudioMemberLeft } from "@/lib/notifications/studio-notifications";
import { getRequestId, logError } from "@/lib/logging/logger";

function resolveUserName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  fallback: string;
}): string {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  const parts = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  const phone = input.phone?.trim();
  if (phone) return phone;
  return input.fallback;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;

  const studio = await prisma.studio.findUnique({
    where: { id: p.id },
    select: {
      id: true,
      providerId: true,
      ownerUserId: true,
      provider: { select: { name: true, ownerUserId: true } },
    },
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

  try {
    const ownerUserId = studio.ownerUserId ?? studio.provider.ownerUserId ?? null;
    if (ownerUserId) {
      const profile = await prisma.userProfile.findUnique({
        where: { id: auth.user.id },
        select: { displayName: true, firstName: true, lastName: true, phone: true },
      });
      const masterName = resolveUserName({
        displayName: profile?.displayName,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        phone: profile?.phone,
        fallback: "Мастер",
      });
      await notifyStudioMemberLeft({
        studioOwnerUserId: ownerUserId,
        masterName,
        studioName: studio.provider.name || "Студия",
      });
    }
  } catch (error) {
    logError("POST /api/studios/[id]/leave notification failed", {
      requestId: getRequestId(_req),
      route: "POST /api/studios/{id}/leave",
      stack: error instanceof Error ? error.stack : String(error),
    });
  }

  return ok({ left: true });
}
