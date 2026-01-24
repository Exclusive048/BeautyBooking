import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api/response";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { AccountType } from "@prisma/client";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const roleError = requireRole(user, AccountType.CLIENT);
  if (roleError) return roleError;

  const bookings = await prisma.booking.findMany({
    where: { clientUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      provider: {
        select: {
          id: true,
          name: true,
          district: true,
          address: true,
        },
      },
      service: {
        select: { name: true },
      },
    },
  });

  return ok({ bookings });
}
