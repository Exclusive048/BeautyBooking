import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { cancelBooking } from "@/lib/bookings/usecases";
import { prisma } from "@/lib/prisma";

const cancelSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

type Cancellation = {
  cancelledBy: "CLIENT" | "PROVIDER";
};

async function resolveCancellation(bookingId: string, userId: string): Promise<Cancellation | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientUserId: true,
      provider: { select: { ownerUserId: true } },
    },
  });
  if (!booking) return null;

  if (booking.provider.ownerUserId === userId) return { cancelledBy: "PROVIDER" };
  if (booking.clientUserId && booking.clientUserId === userId) return { cancelledBy: "CLIENT" };
  return null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const cancellation = await resolveCancellation(p.id, auth.user.id);
  if (!cancellation) return fail("Forbidden", 403, "FORBIDDEN");

  const body = await req.json().catch(() => null);
  const parsed = cancelSchema.safeParse(body ?? {});
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await cancelBooking({
    bookingId: p.id,
    cancelledBy: cancellation.cancelledBy,
    reason: parsed.data.reason ?? null,
  });
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ booking: result.data });
}
