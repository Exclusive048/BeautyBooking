import {
  CABINET_HUB_PATH,
  CLIENT_CABINET_PATH,
  MASTER_CABINET_PATH,
  STUDIO_CABINET_PATH,
} from "@/lib/auth/cabinet-paths";
import { hasMasterProfile } from "@/lib/auth/roles";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";

export type CabinetRedirectDecision = {
  target: string;
  needsHub: boolean;
  hasMasterMode: boolean;
  hasStudioMode: boolean;
};

export async function resolveCabinetRedirect(userId: string): Promise<CabinetRedirectDecision> {
  const [hasMasterMode, hasStudioMode] = await Promise.all([
    hasMasterProfile(userId),
    hasStudioAdminAccess(userId),
  ]);

  if (hasMasterMode && hasStudioMode) {
    return {
      target: CABINET_HUB_PATH,
      needsHub: true,
      hasMasterMode: true,
      hasStudioMode: true,
    };
  }

  if (hasStudioMode) {
    return {
      target: STUDIO_CABINET_PATH,
      needsHub: false,
      hasMasterMode: false,
      hasStudioMode: true,
    };
  }

  if (hasMasterMode) {
    return {
      target: MASTER_CABINET_PATH,
      needsHub: false,
      hasMasterMode: true,
      hasStudioMode: false,
    };
  }

  return {
    target: CLIENT_CABINET_PATH,
    needsHub: false,
    hasMasterMode: false,
    hasStudioMode: false,
  };
}
