import { SubscriptionScope, type Prisma } from "@prisma/client";
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
  await assertStudioTeamSeatAvailable(await resolveStudioTeamSeat(studioId));
}

/** Потолок команды студии по тарифу владельца и Provider студии, чьи мастера считаются. */
export type StudioTeamSeat = {
  /** `Provider.id` студии. */
  providerId: string;
  /** `null` — без ограничения. */
  cap: number | null;
};

type TeamCountClient = Pick<Prisma.TransactionClient, "provider">;

/**
 * INVITE-ACCEPT-ATOMIC — {@link ensureStudioTeamLimit} в две половины. Тариф
 * владельца читается через общий клиент (`getCurrentPlan`) и в транзакции не
 * нужен; занятые места считает {@link assertStudioTeamSeatAvailable} тем
 * клиентом, в чьей транзакции место занимается, — под блокировкой студии
 * (`acceptStudioInvite`): иначе два мастера, принимающие приглашения в студию
 * с одним свободным местом, прошли бы подсчёт оба.
 *
 * @param studioId `Studio.id`
 * @throws 404 STUDIO_NOT_FOUND
 */
export function resolveStudioTeamSeat(studioId: string): Promise<StudioTeamSeat> {
  return resolveStudioTeamCapForStudio(studioId);
}

/** @throws 409 LIMIT_REACHED */
export async function assertStudioTeamSeatAvailable(
  seat: StudioTeamSeat,
  db: TeamCountClient = prisma,
): Promise<void> {
  if (seat.cap === null) return; // unlimited

  const activeCount = await countActiveStudioMasters(seat.providerId, db);
  if (isStudioTeamAtCap(activeCount, seat.cap)) {
    throw createLimitReachedError("maxTeamMasters", seat.cap, activeCount);
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

/**
 * STUDIO-INVITE-LIMITS (D-03, 2026-10-30) — потолок НЕОТВЕЧЕННЫХ приглашений
 * студии. Ожидающее приглашение места в команде не занимает (BC-CAP), поэтому
 * лимит команды их не ограничивал вовсе, а каждое тянет за собой заготовку
 * мастера (`Provider` без владельца) и письмо.
 *
 * Потолок — вдвое больше мест тарифа (FREE 2 → 4, PRO 6 → 12, PREMIUM 20 → 40):
 * студия может звать кандидатов с запасом на тех, кто не ответит. Но не меньше
 * 10: у FREE четыре — это два места и по одному запасному, а приглашения не
 * истекают сами, по телефону без SMS-шлюза доходят не до всех и висят, пока
 * студия их не отзовёт. Команда без ограничения (`null`, назначает админ) — 100.
 * Упёрлась студия — отзывает неотвеченные (`revokeStudioMasterInvite`), текст
 * отказа говорит именно это.
 */
export const STUDIO_PENDING_INVITES_MIN = 10;
export const STUDIO_PENDING_INVITES_PER_SEAT = 2;
export const STUDIO_PENDING_INVITES_UNLIMITED_TEAM = 100;

export function resolveStudioPendingInviteCap(teamCap: number | null): number {
  if (teamCap === null) return STUDIO_PENDING_INVITES_UNLIMITED_TEAM;
  return Math.max(STUDIO_PENDING_INVITES_MIN, teamCap * STUDIO_PENDING_INVITES_PER_SEAT);
}

/**
 * Потолок неотвеченных приглашений студии по тарифу ВЛАДЕЛЬЦА (тот же, что у
 * лимита команды).
 *
 * @param studioId `Studio.id`
 * @throws 404 STUDIO_NOT_FOUND
 */
export async function getStudioPendingInviteCap(studioId: string): Promise<number> {
  const { cap } = await resolveStudioTeamCapForStudio(studioId);
  return resolveStudioPendingInviteCap(cap);
}

function countActiveStudioMasters(studioProviderId: string, db: TeamCountClient = prisma): Promise<number> {
  return db.provider.count({
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
