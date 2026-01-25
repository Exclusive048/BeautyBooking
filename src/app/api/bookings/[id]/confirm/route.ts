import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { confirmBooking } from "@/lib/bookings/usecases";
import { prisma } from "@/lib/prisma";

async function ensureProviderOwner(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, provider: { select: { ownerUserId: true } } },
  });

  if (!booking) return fail("Booking not found", 404, "BOOKING_NOT_FOUND");
  if (booking.provider.ownerUserId !== userId) return fail("Forbidden", 403, "FORBIDDEN");
  return null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureProviderOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const result = await confirmBooking(p.id);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ booking: result.data });
}
