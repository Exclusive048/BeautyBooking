import {
  BookingSource,
  BookingStatus,
  type Booking,
  type Service,
  type UserProfile,
} from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { createRng } from "./helpers/deterministic-rng";
import type { SeededMaster, SeededStudio } from "./seed-providers";

type Input = {
  masters: SeededMaster[];
  studios: SeededStudio[];
  clients: UserProfile[];
};

// Distribution covers all 11 BookingStatus values. Tweak counts here, not in
// the per-status loop — this map is the canonical source of truth.
const STATUS_COUNTS: Record<BookingStatus, number> = {
  NEW: 3,
  PENDING: 5,
  CONFIRMED: 8,
  CHANGE_REQUESTED: 2,
  REJECTED: 2,
  IN_PROGRESS: 1,
  PREPAID: 2,
  STARTED: 2,
  FINISHED: 30,
  CANCELLED: 5,
  NO_SHOW: 3,
};

type StatusBucket = {
  status: BookingStatus;
  // dayOffset relative to today: positive = future, negative = past, 0 = today
  dayOffset: () => number;
};

function statusBuckets(rng: ReturnType<typeof createRng>): StatusBucket[] {
  return [
    { status: "NEW", dayOffset: () => rng.int(1, 7) },
    { status: "PENDING", dayOffset: () => rng.int(1, 14) },
    { status: "CONFIRMED", dayOffset: () => rng.int(1, 30) },
    { status: "CHANGE_REQUESTED", dayOffset: () => rng.int(1, 10) },
    { status: "REJECTED", dayOffset: () => -rng.int(1, 30) },
    { status: "IN_PROGRESS", dayOffset: () => 0 },
    { status: "PREPAID", dayOffset: () => rng.int(1, 14) },
    { status: "STARTED", dayOffset: () => 0 },
    { status: "FINISHED", dayOffset: () => -rng.int(1, 90) },
    { status: "CANCELLED", dayOffset: () => (rng.next() < 0.5 ? -rng.int(1, 30) : rng.int(1, 14)) },
    { status: "NO_SHOW", dayOffset: () => -rng.int(1, 60) },
  ];
}

function buildStartAt(dayOffset: number, rng: ReturnType<typeof createRng>): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  // Pick a working hour (10:00-18:00 local, naive UTC math works for seed)
  const hour = rng.int(10, 18);
  const minute = rng.pick([0, 30] as const);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function buildSlotLabel(start: Date, durationMin: number): string {
  const end = new Date(start.getTime() + durationMin * 60_000);
  const fmt = (n: number) => String(n).padStart(2, "0");
  const date = `${start.getUTCDate()}.${fmt(start.getUTCMonth() + 1)}`;
  const fromHM = `${fmt(start.getUTCHours())}:${fmt(start.getUTCMinutes())}`;
  const toHM = `${fmt(end.getUTCHours())}:${fmt(end.getUTCMinutes())}`;
  return `${date} ${fromHM}-${toHM}`;
}

function deterministicBookingId(args: {
  clientId: string;
  providerId: string;
  status: BookingStatus;
  index: number;
}): string {
  return `seed-bk:${args.providerId.slice(-6)}:${args.clientId.slice(-6)}:${args.status}:${args.index}`;
}

export async function seedBookings(input: Input): Promise<Booking[]> {
  logSeed.section("Bookings (all 11 statuses)");
  const rng = createRng("bookings-v1");
  const buckets = statusBuckets(rng);
  const allProviders: Array<{ providerId: string; userId: string }> = [
    ...input.masters.map((m) => ({ providerId: m.provider.id, userId: m.user.id })),
    ...input.studios.map((s) => ({ providerId: s.provider.id, userId: s.ownerUser.id })),
  ];
  if (allProviders.length === 0) throw new Error("seedBookings: no providers");
  if (input.clients.length === 0) throw new Error("seedBookings: no clients");

  // Cache one service per provider to avoid N round-trips.
  const serviceByProvider = new Map<string, Service>();
  const services = await prisma.service.findMany({
    where: { providerId: { in: allProviders.map((p) => p.providerId) }, isEnabled: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  for (const svc of services) {
    if (!serviceByProvider.has(svc.providerId)) serviceByProvider.set(svc.providerId, svc);
  }

  const created: Booking[] = [];
  for (const bucket of buckets) {
    const count = STATUS_COUNTS[bucket.status];
    for (let i = 0; i < count; i++) {
      const provider = allProviders[(i * 3 + bucket.status.length) % allProviders.length]!;
      const service = serviceByProvider.get(provider.providerId);
      if (!service) continue;
      const client = input.clients[(i * 5 + bucket.status.length) % input.clients.length]!;
      const startAt = buildStartAt(bucket.dayOffset(), rng);
      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
      const id = deterministicBookingId({
        clientId: client.id,
        providerId: provider.providerId,
        status: bucket.status,
        index: i,
      });

      const booking = await prisma.booking.upsert({
        where: { id },
        update: {
          status: bucket.status,
          startAtUtc: startAt,
          endAtUtc: endAt,
          slotLabel: buildSlotLabel(startAt, service.durationMin),
        },
        create: {
          id,
          providerId: provider.providerId,
          serviceId: service.id,
          clientUserId: client.id,
          status: bucket.status,
          startAtUtc: startAt,
          endAtUtc: endAt,
          slotLabel: buildSlotLabel(startAt, service.durationMin),
          clientName: client.displayName ?? client.firstName ?? "Клиент",
          clientPhone: client.phone ?? "",
          source: BookingSource.MANUAL,
        },
      });

      // Snapshot service item — always present after the booking exists.
      const existingItem = await prisma.bookingServiceItem.findFirst({
        where: { bookingId: booking.id, serviceId: service.id },
        select: { id: true },
      });
      if (!existingItem) {
        await prisma.bookingServiceItem.create({
          data: {
            bookingId: booking.id,
            serviceId: service.id,
            titleSnapshot: service.title?.trim() || service.name,
            priceSnapshot: service.price,
            durationSnapshotMin: service.durationMin,
          },
        });
      }

      created.push(booking);
    }
  }

  logSeed.ok(`${created.length} bookings upserted across ${Object.keys(STATUS_COUNTS).length} statuses`);
  return created;
}
