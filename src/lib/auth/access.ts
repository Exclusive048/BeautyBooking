import { AccountType, MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { hasAnyRole, requireAuthFromRequest } from "@/lib/auth/guards";

export type SessionUser = {
  userId: string;
  role: AccountType;
  roles: AccountType[];
  providerId?: string | null;
  studioId?: string | null;
};

const ROLE_PRIORITY: AccountType[] = [
  AccountType.SUPERADMIN,
  AccountType.ADMIN,
  AccountType.STUDIO_ADMIN,
  AccountType.STUDIO,
  AccountType.MASTER,
  AccountType.CLIENT,
];

function pickRole(roles: AccountType[]): AccountType {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return AccountType.CLIENT;
}

async function resolveStudioIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.studioMembership.findFirst({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
    },
    select: { studioId: true },
  });
  return membership?.studioId ?? null;
}

async function resolveProviderIds(
  userId: string,
  role: AccountType
): Promise<{ providerId: string | null; studioId: string | null }> {
  if (role === AccountType.MASTER) {
    const provider = await prisma.provider.findFirst({
      where: { ownerUserId: userId, type: ProviderType.MASTER },
      select: { id: true },
    });
    return { providerId: provider?.id ?? null, studioId: null };
  }

  if (role === AccountType.STUDIO || role === AccountType.STUDIO_ADMIN) {
    const provider = await prisma.provider.findFirst({
      where: { ownerUserId: userId, type: ProviderType.STUDIO },
      select: { id: true },
    });
    const providerId = provider?.id ?? null;
    const studio = providerId
      ? await prisma.studio.findUnique({
          where: { providerId },
          select: { id: true },
        })
      : null;
    const membershipStudioId = role === AccountType.STUDIO_ADMIN ? await resolveStudioIdForUser(userId) : null;
    return { providerId, studioId: studio?.id ?? membershipStudioId };
  }

  return { providerId: null, studioId: null };
}

export async function getSessionUser(req: Request): Promise<SessionUser> {
  const auth = await requireAuthFromRequest(req);
  if (!auth.ok) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }
  const user = auth.user;

  const role = pickRole(user.roles);
  const { providerId, studioId } = await resolveProviderIds(user.id, role);

  return {
    userId: user.id,
    role,
    roles: user.roles,
    providerId,
    studioId,
  };
}

export function requireRole(user: SessionUser, roles: AccountType[]): AppError | null {
  if (!hasAnyRole(user, roles)) {
    return new AppError("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}
