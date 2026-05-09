import { ProviderType, SubscriptionScope } from "@prisma/client";
import { getCurrentPlan, type CurrentPlanInfo } from "@/lib/billing/get-current-plan";
import { prisma } from "@/lib/prisma";

/**
 * Server aggregator for `/cabinet/master/account` (31-final).
 *
 * One round-trip — UserProfile + linked accounts + active session
 * count + plan summary. The page is purely RSC; mutations are routed
 * to existing endpoints (Telegram/VK status, /api/me/delete) plus one
 * new revoke-others endpoint.
 *
 * Notable trade-offs (intentional, see BACKLOG):
 *   - No per-event notification preferences — `NotificationPreference`
 *     model doesn't exist; only channel-level toggles surface here.
 *   - No detailed sessions list — `RefreshSession` lacks `userAgent` /
 *     `ipAddress` columns, so device labels would be invented. We
 *     surface only the count + a "revoke all other sessions" action.
 */

export type MasterAccountIdentity = {
  phone: string | null;
  email: string | null;
  displayName: string | null;
};

export type MasterAccountConnections = {
  telegram: {
    connected: boolean;
    isEnabled: boolean;
    username: string | null;
  };
  vk: {
    connected: boolean;
    vkUserId: string | null;
  };
};

export type MasterAccountSessions = {
  /** Number of active (not revoked, not expired) RefreshSession rows. */
  activeCount: number;
  /** True when there's at least one session besides this one. The
   * current session is approximated as "the most-recently-updated
   * non-revoked row" — adequate signal for the "Завершить остальные"
   * button visibility. */
  hasOthers: boolean;
};

export type MasterAccountPlan = {
  planCode: string | null;
  /** Localised tier label (PRO / FREE / PREMIUM) — for display only.
   * Logic decisions still gate on `info.tier`. */
  tier: CurrentPlanInfo["tier"];
  currentPeriodEndIso: string | null;
  autoRenew: boolean;
  /** Whether the master has an active paid subscription (vs FREE). */
  isPaid: boolean;
};

export type MasterAccountViewData = {
  providerId: string;
  identity: MasterAccountIdentity;
  connections: MasterAccountConnections;
  sessions: MasterAccountSessions;
  plan: MasterAccountPlan;
  /** UserProfile.roles snapshot for the Account tab's roles card. */
  roles: string[];
};

export async function getMasterAccountView(input: {
  userId: string;
}): Promise<MasterAccountViewData | null> {
  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: ProviderType.MASTER },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!provider) return null;

  const now = new Date();

  const [user, telegramLink, vkLink, subscription, plan, activeSessionCount] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: input.userId },
      select: {
        phone: true,
        email: true,
        displayName: true,
        telegramUsername: true,
        roles: true,
      },
    }),
    prisma.telegramLink.findUnique({
      where: { userId: input.userId },
      select: { isEnabled: true },
    }),
    prisma.vkLink.findUnique({
      where: { userId: input.userId },
      select: { vkUserId: true },
    }),
    prisma.userSubscription.findUnique({
      where: { userId_scope: { userId: input.userId, scope: SubscriptionScope.MASTER } },
      select: { currentPeriodEnd: true, autoRenew: true, status: true },
    }),
    getCurrentPlan(input.userId, SubscriptionScope.MASTER),
    prisma.refreshSession.count({
      where: {
        userId: input.userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
  ]);

  if (!user) return null;

  // "hasOthers" = at least 2 active sessions. The currently-paginated
  // request is itself one of those rows (newly issued or rotated).
  const hasOthers = activeSessionCount > 1;

  return {
    providerId: provider.id,
    identity: {
      phone: user.phone,
      email: user.email,
      displayName: user.displayName,
    },
    connections: {
      telegram: {
        connected: telegramLink !== null,
        isEnabled: Boolean(telegramLink?.isEnabled),
        username: user.telegramUsername,
      },
      vk: {
        connected: vkLink !== null,
        vkUserId: vkLink?.vkUserId ?? null,
      },
    },
    sessions: {
      activeCount: activeSessionCount,
      hasOthers,
    },
    plan: {
      planCode: plan.planCode,
      tier: plan.tier,
      currentPeriodEndIso: subscription?.currentPeriodEnd
        ? subscription.currentPeriodEnd.toISOString()
        : null,
      autoRenew: subscription?.autoRenew ?? false,
      isPaid: plan.tier === "PRO" || plan.tier === "PREMIUM",
    },
    roles: user.roles,
  };
}
