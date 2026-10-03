import { createStudioProfile } from "@/lib/profiles/professional";
import { getSessionUser } from "@/lib/auth/session";
import { nextRedirect } from "@/lib/http/origin";
import { respondProfessionalOnboardingJson, wantsJsonResponse } from "@/lib/profiles/onboarding-json";

export async function GET(req: Request) {
  return nextRedirect(req, "/cabinet/roles", 303);
}

export async function POST(req: Request) {
  // MOBILE-B1: Bearer / `Accept: application/json` — конверт вместо 303
  // (`lib/profiles/onboarding-json.ts`). Веб-форма — ветка ниже, без изменений.
  if (wantsJsonResponse(req)) {
    return respondProfessionalOnboardingJson("STUDIO", "POST /api/onboarding/professional/studio");
  }
  const user = await getSessionUser();
  if (!user) return nextRedirect(req, "/login", 303);

  await createStudioProfile({ userId: user.id, roles: user.roles });
  return nextRedirect(req, "/cabinet/studio", 303);
}
