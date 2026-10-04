import { SubscriptionScope } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { STUDIO_TEAM_CAP_BY_TIER } from "@/lib/billing/constants";
import type { PlanFeatures } from "@/lib/billing/features";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createLimitReachedError } from "@/lib/billing/guards";
import { prisma } from "@/lib/prisma";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";

/**
 * BC-CAP — the studio team-size cap for a resolved plan. Single lookup:
 * the cap IS the `maxTeamMasters` plan feature (admin-managed for PRO/PREMIUM,
 * seeded for FREE). `null` = unlimited.
 */
export function resolveStudioTeamCap(
  features: Pick<PlanFeatures, "maxTeamMasters">,
): number | null {
  return features.maxTeamMasters;
}

/**
 * BC-CAP — pure enforcement decision. `null` cap = unlimited (never at cap).
 * Adding one more ACTIVE master is blocked once the current ACTIVE count has
 * reached the cap (i.e. `activeCount >= cap`).
 */
export function isStudioTeamAtCap(activeCount: number, cap: number | null): boolean {
  if (cap === null) return false;
  return activeCount >= cap;
}

/**
 * Enforces the studio team-size cap.
 *
 * BC-CAP counting basis: **ACTIVE masters only** (invite accepted + published),
 * via {@link STUDIO_ACTIVE_MASTER_WHERE}. Pending invites and INVITED/DISABLED
 * masters do NOT consume a seat, so this must fire at every point a seat
 * actually becomes ACTIVE (invite acceptance + re-activate), not only at
 * invite-send. See callers.
 *
 * The cap is resolved from the studio OWNER's plan (not the acting user) so an
 * ADMIN performing the action — or an invitee accepting — is measured against
 * the studio's real subscription, and the owner-vs-invitee mismatch can't
 * mis-resolve the tier.
 *
 * @param studioId `Studio.id`
 * @throws 404 STUDIO_NOT_FOUND · 409 LIMIT_REACHED
 */
export async function ensureStudioTeamLimit(studioId: string): Promise<void> {
  const { providerId, cap } = await resolveStudioTeamCapForStudio(studioId);
  if (cap === null) return; // unlimited

  const activeCount = await countActiveStudioMasters(providerId);
  if (isStudioTeamAtCap(activeCount, cap)) {
    throw createLimitReachedError("maxTeamMasters", cap, activeCount);
  }
}

/** MOBILE-STUDIO-C (team) — потолок команды и занятые места, без отказа. */
export type StudioTeamCapacity = {
  /** `null` — без ограничения. */
  max: number | null;
  /** Мастера, занимающие место: приглашение принято и не на паузе. */
  activeCount: number;
};

/**
 * MOBILE-STUDIO-C (team) — то же правило, что у {@link ensureStudioTeamLimit}
 * (тариф ВЛАДЕЛЬЦА студии, считаются только ACTIVE), но без отказа: список
 * команды в приложении показывает «лимит» до того, как пользователь откроет
 * приглашение.
 *
 * @param studioId `Studio.id`
 * @throws 404 STUDIO_NOT_FOUND
 */
export async function getStudioTeamCapacity(studioId: string): Promise<StudioTeamCapacity> {
  const { providerId, cap } = await resolveStudioTeamCapForStudio(studioId);
  return { max: cap, activeCount: await countActiveStudioMasters(providerId) };
}

function countActiveStudioMasters(studioProviderId: string): Promise<number> {
  return prisma.provider.count({
    where: {
      type: "MASTER",
      studioId: studioProviderId,
      ...STUDIO_ACTIVE_MASTER_WHERE,
    },
  });
}

async function resolveStudioTeamCapForStudio(
  studioId: string,
): Promise<{ providerId: string; cap: number | null }> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: {
      id: true,
      providerId: true,
      ownerUserId: true,
      provider: { select: { ownerUserId: true } },
    },
  });
  if (!studio) {
    throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
  }

  const ownerUserId = studio.ownerUserId ?? studio.provider.ownerUserId;
  if (!ownerUserId) {
    // Orphaned studio (no resolvable owner — should not happen post-onboarding).
    // Enforce the most restrictive FREE cap defensively rather than allowing
    // unlimited masters.
    return { providerId: studio.providerId, cap: STUDIO_TEAM_CAP_BY_TIER.FREE };
  }
  const plan = await getCurrentPlan(ownerUserId, SubscriptionScope.STUDIO);
  return { providerId: studio.providerId, cap: resolveStudioTeamCap(plan.features) };
}
