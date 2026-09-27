import { prisma } from "@/lib/prisma";
import { invalidateSlotsForBooking } from "@/lib/schedule/slotsCache";
import { resolveOccupancyProviderIds } from "@/lib/schedule/occupancy";

type BookingRange = {
  providerId: string;
  masterProviderId: string | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
};

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

async function resolveProviderTimezone(providerId: string): Promise<string | null> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { timezone: true },
  });
  return provider?.timezone ?? null;
}

/**
 * STUDIO-MASTER-PROFILES: запись занимает время ЧЕЛОВЕКА, поэтому окошки
 * сбрасываются у всех его профилей (личного и в студии), каждый — в своём
 * поясе. Иначе профиль-сосед до 120 с отдавал бы занятое время из кэша.
 */
export async function invalidateSlotsForBookingRange(input: BookingRange): Promise<void> {
  const startAtUtc = input.startAtUtc;
  const endAtUtc = input.endAtUtc;
  if (!isValidDate(startAtUtc) || !isValidDate(endAtUtc)) return;
  const masterId = input.masterProviderId ?? input.providerId;
  if (!masterId) return;
  const occupancyIds = await resolveOccupancyProviderIds(prisma, masterId);
  await Promise.all(
    occupancyIds.map(async (profileId) => {
      const timezone = await resolveProviderTimezone(profileId);
      if (!timezone) return;
      await invalidateSlotsForBooking(profileId, startAtUtc, endAtUtc, timezone);
    }),
  );
}

export async function invalidateSlotsForBookingMove(input: {
  previous: BookingRange;
  next: BookingRange;
}): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (isValidDate(input.previous.startAtUtc) && isValidDate(input.previous.endAtUtc)) {
    tasks.push(invalidateSlotsForBookingRange(input.previous));
  }
  if (isValidDate(input.next.startAtUtc) && isValidDate(input.next.endAtUtc)) {
    tasks.push(invalidateSlotsForBookingRange(input.next));
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}
