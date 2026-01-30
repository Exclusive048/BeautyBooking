import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { rescheduleBooking } from "@/lib/bookings/usecases";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, StudioRole } from "@prisma/client";

const rescheduleSchema = z.object({
  startAtUtc: z.string().trim().min(1),
  endAtUtc: z.string().trim().min(1),
  slotLabel: z.string().trim().min(1),
});

async function canRescheduleBooking(bookingId: string, userId: string): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientUserId: true,
      providerId: true,
      provider: { select: { ownerUserId: true, type: true } },
      masterProvider: { select: { ownerUserId: true } },
    },
  });
  if (!booking) return false;

  if (booking.clientUserId && booking.clientUserId === userId) return true;
  if (booking.masterProvider?.ownerUserId === userId) return true;
  if (booking.provider.ownerUserId === userId) return true;

  if (booking.provider.type === "STUDIO") {
    const studio = await prisma.studio.findUnique({
      where: { providerId: booking.providerId },
      select: { id: true },
    });
    if (!studio) return false;

    const membership = await prisma.studioMembership.findFirst({
      where: {
        studioId: studio.id,
        userId,
        status: MembershipStatus.ACTIVE,
        roles: { hasSome: [StudioRole.ADMIN, StudioRole.OWNER] },
      },
      select: { id: true },
    });
    if (membership) return true;
  }

  return false;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const allowed = await canRescheduleBooking(p.id, auth.user.id);
  if (!allowed) return fail("Forbidden", 403, "FORBIDDEN");

  const body = await req.json().catch(() => null);
  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const startAtUtc = new Date(parsed.data.startAtUtc);
  const endAtUtc = new Date(parsed.data.endAtUtc);
  if (Number.isNaN(startAtUtc.getTime()) || Number.isNaN(endAtUtc.getTime())) {
    return fail("Invalid date", 400, "DATE_INVALID");
  }

  const result = await rescheduleBooking({
    bookingId: p.id,
    startAtUtc,
    endAtUtc,
    slotLabel: parsed.data.slotLabel,
  });
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ booking: result.data });
}
