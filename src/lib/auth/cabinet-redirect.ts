import { AccountType } from "@prisma/client";
import {
  CLIENT_CABINET_PATH,
  MASTER_CABINET_PATH,
  STUDIO_CABINET_PATH,
} from "@/lib/auth/cabinet-paths";
import { hasMasterProfile } from "@/lib/auth/roles";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { prisma } from "@/lib/prisma";

// QA-002: platform admin panel landing. Kept inline (not in cabinet-paths) to
// scope the fix to this file — it is not a self-service cabinet path.
const ADMIN_PANEL_PATH = "/admin";

export type CabinetRedirectDecision = {
  target: string;
  hasMasterMode: boolean;
  hasStudioMode: boolean;
};

export async function resolveCabinetRedirect(userId: string): Promise<CabinetRedirectDecision> {
  const [hasMasterMode, hasStudioMode] = await Promise.all([
    hasMasterProfile(userId),
    hasStudioAdminAccess(userId),
  ]);

  if (hasStudioMode && !hasMasterMode) {
    return {
      target: STUDIO_CABINET_PATH,
      hasMasterMode: false,
      hasStudioMode: true,
    };
  }

  if (hasMasterMode && !hasStudioMode) {
    return {
      target: MASTER_CABINET_PATH,
      hasMasterMode: true,
      hasStudioMode: false,
    };
  }

  // QA-002: a platform admin with no master/studio pro-cabinet was falling
  // through to the client cabinet. Land them on /admin instead. Pro roles above
  // still win, so a master/studio admin keeps their workspace — only the
  // client-fallback path now checks for ADMIN/SUPERADMIN first.
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { roles: true },
  });
  const isAdmin =
    profile?.roles.some(
      (role) => role === AccountType.ADMIN || role === AccountType.SUPERADMIN,
    ) ?? false;
  if (isAdmin) {
    return { target: ADMIN_PANEL_PATH, hasMasterMode, hasStudioMode };
  }

  return {
    target: CLIENT_CABINET_PATH,
    hasMasterMode,
    hasStudioMode,
  };
}
