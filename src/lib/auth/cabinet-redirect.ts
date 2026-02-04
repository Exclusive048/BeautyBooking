import {
  CLIENT_CABINET_PATH,
  MASTER_CABINET_PATH,
  STUDIO_CABINET_PATH,
} from "@/lib/auth/cabinet-paths";
import { hasMasterProfile } from "@/lib/auth/roles";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";

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

  return {
    target: CLIENT_CABINET_PATH,
    hasMasterMode,
    hasStudioMode,
  };
}
