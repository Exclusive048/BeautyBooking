import { AccountType, MembershipStatus, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLE_ADDITIONS: ReadonlySet<AccountType> = new Set([
  AccountType.MASTER,
  AccountType.STUDIO,
]);

const SELF_SERVICE_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  AccountType.CLIENT,
  AccountType.MASTER,
  AccountType.STUDIO,
]);

export function isAllowedRoleAddition(role: AccountType): boolean {
  return ALLOWED_ROLE_ADDITIONS.has(role);
}

export function isAllowedAccountTypeSelection(type: AccountType): boolean {
  return SELF_SERVICE_ACCOUNT_TYPES.has(type);
}

export function roleRedirect(role: AccountType): string {
  if (role === AccountType.MASTER) return "/cabinet/master";
  if (role === AccountType.STUDIO) return "/cabinet/studio";
  return "/roles";
}

export function accountTypeRedirect(type: AccountType): string {
  if (type === AccountType.MASTER) return "/cabinet/master";
  if (type === AccountType.STUDIO) return "/cabinet/studio";
  return "/";
}

function ensureClientRole(roles: AccountType[]): AccountType[] {
  return Array.from(new Set([...roles, AccountType.CLIENT]));
}

export async function addRoleToUser(
  userId: string,
  roles: AccountType[],
  role: AccountType
): Promise<AccountType[]> {
  const nextRoles = ensureClientRole([...roles, role]);
  await prisma.userProfile.update({
    where: { id: userId },
    data: { roles: { set: nextRoles } },
  });
  return nextRoles;
}

export async function setAccountTypeRoles(
  userId: string,
  roles: AccountType[],
  type: AccountType
): Promise<AccountType[]> {
  const nextRoles = ensureClientRole([...roles, type]);
  await prisma.userProfile.update({
    where: { id: userId },
    data: { roles: { set: nextRoles } },
  });
  return nextRoles;
}

export async function ensureClientRoleForUser(
  userId: string,
  roles: AccountType[]
): Promise<AccountType[]> {
  if (roles.includes(AccountType.CLIENT)) return roles;
  const nextRoles = ensureClientRole(roles);
  await prisma.userProfile.update({
    where: { id: userId },
    data: { roles: { set: nextRoles } },
  });
  return nextRoles;
}

export async function hasMasterProfile(userId: string): Promise<boolean> {
  const profile = await prisma.masterProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return Boolean(profile);
}

export async function getActiveStudioMemberships(userId: string): Promise<
  { studioId: string; roles: StudioRole[] }[]
> {
  const memberships = await prisma.studioMembership.findMany({
    where: { userId, status: MembershipStatus.ACTIVE },
    select: { studioId: true, roles: true },
  });
  return memberships;
}

export async function hasGlobalMasterProfile(userId: string): Promise<boolean> {
  const profile = await prisma.masterProfile.findUnique({
    where: { userId },
    select: { provider: { select: { studioId: true } } },
  });
  return Boolean(profile && profile.provider?.studioId == null);
}
