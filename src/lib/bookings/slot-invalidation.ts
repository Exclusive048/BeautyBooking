import { prisma } from "@/lib/prisma";
import { invalidateSlotsForBooking } from "@/lib/schedule/slotsCache";

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

export async function invalidateSlotsForBookingRange(input: BookingRange): Promise<void> {
  if (!isValidDate(input.startAtUtc) || !isValidDate(input.endAtUtc)) return;
  const masterId = input.masterProviderId ?? input.providerId;
  if (!masterId) return;
  const timezone = await resolveProviderTimezone(masterId);
  if (!timezone) return;
  await invalidateSlotsForBooking(masterId, input.startAtUtc, input.endAtUtc, timezone);
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
