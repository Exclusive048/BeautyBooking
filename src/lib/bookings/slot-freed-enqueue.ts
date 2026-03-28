import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/queue/queue";
import { createSlotFreedJob } from "@/lib/queue/types";
import { logError } from "@/lib/logging/logger";
import type { BookingWithRelations } from "@/lib/notifications/booking-notifications";

const CANCELLABLE_STATUSES = new Set(["CONFIRMED", "PENDING"]);

export async function enqueueSlotFreedJob(
  booking: BookingWithRelations,
  cancelledByUserId: string | null
): Promise<void> {
  try {
    if (!CANCELLABLE_STATUSES.has(booking.status) && booking.status !== "REJECTED") {
      return;
    }

    if (!booking.startAtUtc || !booking.endAtUtc) return;

    const masterId = booking.masterProviderId ?? booking.providerId;

    const master = await prisma.provider.findUnique({
      where: { id: masterId },
      select: {
        id: true,
        name: true,
        publicUsername: true,
        timezone: true,
        type: true,
      },
    });

    if (!master || master.type !== "MASTER") return;

    const serviceName = booking.service
      ? (booking.service.title?.trim() || booking.service.name)
      : null;

    await enqueue(
      createSlotFreedJob({
        providerId: master.id,
        providerName: master.name,
        providerPublicUsername: master.publicUsername,
        timezone: master.timezone,
        slotStartAtUtc: booking.startAtUtc.toISOString(),
        slotEndAtUtc: booking.endAtUtc.toISOString(),
        serviceName,
        cancelledByUserId,
      })
    );
  } catch (error) {
    logError("Failed to enqueue slot.freed job", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
