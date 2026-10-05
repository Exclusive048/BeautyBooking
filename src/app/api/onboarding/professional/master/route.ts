import { createMasterProfile } from "@/lib/profiles/professional";
import { getSessionUser } from "@/lib/auth/session";
import { nextRedirect } from "@/lib/http/origin";
import { logInfo } from "@/lib/logging/logger";
import { respondProfessionalOnboardingJson, wantsJsonResponse } from "@/lib/profiles/onboarding-json";

export async function GET(req: Request) {
  return nextRedirect(req, "/cabinet/roles", 303);
}

export async function POST(req: Request) {
  // MOBILE-B1: Bearer / `Accept: application/json` — конверт вместо 303
  // (`lib/profiles/onboarding-json.ts`). Веб-форма — ветка ниже, без изменений.
  if (wantsJsonResponse(req)) {
    return respondProfessionalOnboardingJson("MASTER", "POST /api/onboarding/professional/master");
  }
  const routeStartedAt = Date.now();
  const sessionStartedAt = Date.now();
  const user = await getSessionUser();
  logInfo("POST /api/onboarding/professional/master: getSessionUser", {
    ms: Date.now() - sessionStartedAt,
  });
  if (!user) return nextRedirect(req, "/login", 303);

  const createStartedAt = Date.now();
  await createMasterProfile({
    userId: user.id,
    roles: user.roles,
    ensureFreeSubscriptionMode: "background",
  });
  logInfo("POST /api/onboarding/professional/master: createMasterProfile", {
    userId: user.id,
    ms: Date.now() - createStartedAt,
  });
  logInfo("POST /api/onboarding/professional/master: total", {
    userId: user.id,
    ms: Date.now() - routeStartedAt,
  });

  return nextRedirect(req, "/cabinet/master", 303);
}
