import { AccountType, BookingStatus } from "@prisma/client";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth/admin";

const PRO_ROLES = new Set<AccountType>([
  AccountType.MASTER,
  AccountType.STUDIO,
  AccountType.STUDIO_ADMIN,
]);

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  const [newUsers, bookingsLast24h, activeSubscriptions, recentUsers7Days, recentBookings] =
    await Promise.all([
      prisma.userProfile.findMany({
        where: { createdAt: { gte: startOfToday } },
        select: { roles: true },
      }),
      prisma.booking.count({
        where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.userSubscription.count({
        where: {
          status: { in: ["ACTIVE", "PAST_DUE"] },
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
          plan: { code: { notIn: ["MASTER_FREE", "STUDIO_FREE"] } },
        },
      }),
      prisma.userProfile.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.booking.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          status: true,
          createdAt: true,
          provider: { select: { name: true } },
          service: { select: { name: true } },
        },
      }),
    ]);

  // --- Today registrations ---
  let clients = 0;
  let pros = 0;
  for (const user of newUsers) {
    if (user.roles.some((role) => PRO_ROLES.has(role))) {
      pros += 1;
    } else {
      clients += 1;
    }
  }

  // --- 7-day chart ---
  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    byDay.set(toDateKey(d), 0);
  }
  for (const user of recentUsers7Days) {
    const key = toDateKey(user.createdAt);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const registrationsLast7Days = Array.from(byDay.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  // --- Recent bookings activity ---
  const recentActivity = recentBookings.map((booking) => ({
    id: booking.id,
    providerName: booking.provider?.name ?? "—",
    serviceName: booking.service?.name ?? "—",
    status: booking.status as BookingStatus,
    timeIso: booking.createdAt.toISOString(),
  }));

  return ok({
    registrationsToday: { clients, pros, total: clients + pros },
    bookingsLast24h,
    profileViewsLast24h: null,
    conversion: null,
    conversionNote: null,
    activeSubscriptions,
    registrationsLast7Days,
    recentActivity,
  });
}
