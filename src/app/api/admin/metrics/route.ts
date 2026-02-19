import { AccountType } from "@prisma/client";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth/admin";

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [newUsers, bookingsLast24h, activeSubscriptions] = await Promise.all([
    prisma.userProfile.findMany({
      where: { createdAt: { gte: startOfToday } },
      select: { roles: true },
    }),
    prisma.booking.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.userSubscription.count({
      where: {
        status: { in: ["ACTIVE", "PAST_DUE"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
        plan: { code: { notIn: ["MASTER_FREE", "STUDIO_FREE"] } },
      },
    }),
  ]);

  const proRoles = new Set<AccountType>([
    AccountType.MASTER,
    AccountType.STUDIO,
    AccountType.STUDIO_ADMIN,
  ]);
  let clients = 0;
  let pros = 0;

  for (const user of newUsers) {
    const isPro = user.roles.some((role) => proRoles.has(role));
    if (isPro) {
      pros += 1;
    } else {
      clients += 1;
    }
  }

  return ok({
    registrationsToday: {
      clients,
      pros,
      total: clients + pros,
    },
    bookingsLast24h,
    profileViewsLast24h: null,
    conversion: null,
    conversionNote: "Метрика появится после внедрения трекинга",
    activeSubscriptions,
  });
}
