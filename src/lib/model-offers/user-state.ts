import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth/session";

export const MODELS_INTRO_SEEN_COOKIE = "models-intro-seen";

export type ModelOfferUserState = "newcomer" | "returning";

/**
 * Determines whether the visitor has prior interaction with the model offers
 * surface. Used to decide between the full educational hero (first visit) and
 * the compact hero (returning users).
 *
 * Hybrid check, ordered cheapest-first:
 *   1. Cookie `models-intro-seen=1` — set on the previous visit via the
 *      `markModelsIntroSeen` server action.
 *   2. For authenticated users only: a single `ModelApplication.count`
 *      with `take: 1` against `clientUserId` (uses the existing index).
 *
 * Anonymous users without the cookie are always treated as newcomers.
 */
export async function getModelOfferUserState(): Promise<ModelOfferUserState> {
  const cookieStore = await cookies();
  const seen = cookieStore.get(MODELS_INTRO_SEEN_COOKIE)?.value;
  if (seen === "1") return "returning";

  const userId = await getSessionUserId();
  if (!userId) return "newcomer";

  const count = await prisma.modelApplication.count({
    where: { clientUserId: userId },
    take: 1,
  });
  return count > 0 ? "returning" : "newcomer";
}
