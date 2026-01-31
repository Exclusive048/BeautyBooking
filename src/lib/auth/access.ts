import { AccountType, MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth/jwt";
import { AppError } from "@/lib/api/errors";

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

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const entries = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return [part, ""] as const;
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()] as const;
    });
  return Object.fromEntries(entries);
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
  const header = req.headers.get("cookie");
  const cookies = parseCookies(header);
  const name = process.env.AUTH_COOKIE_NAME ?? "bh_session";
  const token = cookies[name];
  if (!token) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const user = await prisma.userProfile.findUnique({
    where: { id: payload.sub },
    select: { id: true, roles: true },
  });
  if (!user) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

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
  if (!roles.some((role) => user.roles.includes(role))) {
    return new AppError("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}
