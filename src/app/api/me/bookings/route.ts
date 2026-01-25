import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const bookings = await prisma.booking.findMany({
    where: { clientUserId: auth.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      provider: { select: { id: true, name: true, type: true } },
      service: { select: { id: true, name: true, durationMin: true, price: true } },
    },
  });

  if (!bookings) return fail("Failed to load bookings", 500, "BOOKINGS_LOAD_FAILED");

  return ok({ bookings });
}
