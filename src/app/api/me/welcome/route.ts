import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { markWelcomeSeen } from "@/lib/onboarding/welcome-seen";
import { invalidateMeIdentityCache } from "@/lib/users/me";

/**
 * WELCOME-DIALOG-01 — человек закрыл приветствие этапа тестирования.
 * Ставит `UserProfile.welcomeSeenAt` (идемпотентно) и сбрасывает кэш `/api/me`,
 * чтобы окно не вернулось на следующей странице.
 */
export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  await markWelcomeSeen(auth.user.id);
  await invalidateMeIdentityCache(auth.user.id);
  return ok({ ok: true });
}
