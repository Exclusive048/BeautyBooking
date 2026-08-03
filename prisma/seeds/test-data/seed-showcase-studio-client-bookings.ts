/**
 * ============================================================
 * SHOWCASE — Vision studio bookings for the showcase CLIENT
 * (STUDIO-BOOKING-E2E 2026-06-30)
 * ============================================================
 *
 * Adds studio-master bookings between the showcase client
 * **Елена Петрова** (+7 999 500 00 00) and the Vision studio-master
 * **Марина Лебедева** (+7 999 300 00 00) so the R2-06-A (studio reschedule,
 * two-sided, invariant #32) and R2-06-I (studio self-review block,
 * invariant #33) flows are live-verifiable end-to-end. Before this, the
 * showcase client had bookings ONLY against Anna's solo provider, and the
 * 56 Vision bookings used the generic random-client pool — so there was no
 * studio-master booking the showcase client could log in and act on.
 *
 * Runs LAST (after seedShowcaseStudio + seedShowcaseClient) because it
 * needs BOTH the Vision studio/master/service AND Елена's UserProfile to
 * already exist. Resolves every dependency by its stable key (studio +
 * master publicUsername, service name within the studio, client phone) and
 * throws loudly if a dependency is missing (a silent null clientUserId
 * would make the E2E prove nothing).
 *
 * Three deterministic bookings (upsert by id → idempotent re-runs):
 *   • seed-vision-elena-accept   — future CONFIRMED → drives the reschedule
 *                                   ACCEPT round-trip (client requests, owner
 *                                   accepts → booking moves).
 *   • seed-vision-elena-decline  — future CONFIRMED → drives the reschedule
 *                                   DECLINE round-trip (owner declines →
 *                                   booking stays).
 *   • seed-vision-elena-review   — elapsed FINISHED (started ~yesterday,
 *                                   inside the 3-day review window) → drives
 *                                   the self-review block (owner/master
 *                                   blocked) + the client-review control.
 *
 * Salon-tz: times are computed with the Yekaterinburg-local `dateAtLocalUtc`
 * (FIX-EXP-SEED-HYGIENE — no naive-UTC drift), mirroring seed-showcase-studio.
 * Booking + BookingServiceItem shape mirrors `createStudioBooking`
 * (src/lib/studio/bookings.service.ts) and `ensureBookings`
 * (seed-showcase-studio.ts) exactly, with `clientUserId` set so the client
 * can log in and act.
 */

import { BookingStatus, BookingSource } from "@prisma/client";
import { logSeed } from "./helpers/log";
import { prisma } from "./helpers/prisma";
import { SHOWCASE_PHONE_CLIENT } from "./helpers/markers";

// Must equal the seeded City.timezone for Yekaterinburg (seed-showcase-studio).
const SALON_TZ = "Asia/Yekaterinburg";

const STUDIO_USERNAME = "vision-studio";
const MASTER_USERNAME = "vision-marina-lebedeva-1"; // Марина Лебедева (manicure)
const SERVICE_NAME_RU = "Маникюр классический"; // manicure-classic, durationMin 60

// ── tz-aware time helpers (mirror seed-showcase-studio.ts) ────────────────────

function startOfUtcDay(date: Date): Date {
  const out = new Date(date);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) === 24 ? 0 : Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUtc - at.getTime();
}

/** UTC instant whose wall-clock in SALON_TZ is (hour:minute) on `offsetDays`. */
function dateAtLocalUtc(offsetDays: number, hour: number, minute = 0, base = new Date()): Date {
  const day = startOfUtcDay(base);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  const guess = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, 0, 0)
  );
  return new Date(guess.getTime() - tzOffsetMs(guess, SALON_TZ));
}

type BookingPlan = {
  id: string;
  status: BookingStatus;
  start: Date;
};

export async function seedShowcaseStudioClientBookings(): Promise<number> {
  // ── Resolve dependencies by stable key (loud on miss) ──────────────────────
  const studioProvider = await prisma.provider.findFirst({
    where: { publicUsername: STUDIO_USERNAME },
    select: { id: true },
  });
  if (!studioProvider) {
    throw new Error(
      `seed-showcase-studio-client-bookings: Vision studio provider (publicUsername=${STUDIO_USERNAME}) not found — run seedShowcaseStudio first.`
    );
  }

  const studio = await prisma.studio.findFirst({
    where: { providerId: studioProvider.id },
    select: { id: true },
  });
  if (!studio) {
    throw new Error(
      `seed-showcase-studio-client-bookings: Studio row for provider ${studioProvider.id} not found.`
    );
  }

  const master = await prisma.provider.findFirst({
    where: { publicUsername: MASTER_USERNAME },
    select: { id: true },
  });
  if (!master) {
    throw new Error(
      `seed-showcase-studio-client-bookings: Vision master (publicUsername=${MASTER_USERNAME}) not found.`
    );
  }

  const service = await prisma.service.findFirst({
    where: { providerId: studioProvider.id, name: SERVICE_NAME_RU },
    select: { id: true, name: true, price: true, durationMin: true },
  });
  if (!service) {
    throw new Error(
      `seed-showcase-studio-client-bookings: studio service "${SERVICE_NAME_RU}" not found for provider ${studioProvider.id}.`
    );
  }

  const client = await prisma.userProfile.findFirst({
    where: { phone: SHOWCASE_PHONE_CLIENT },
    select: { id: true, displayName: true, firstName: true, lastName: true, phone: true },
  });
  if (!client) {
    throw new Error(
      `seed-showcase-studio-client-bookings: showcase client (phone=${SHOWCASE_PHONE_CLIENT}) not found — run seedShowcaseClient first.`
    );
  }

  const clientName =
    client.displayName ?? (`${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Елена Петрова");
  const clientPhone = client.phone ?? SHOWCASE_PHONE_CLIENT;

  const plans: BookingPlan[] = [
    // Future CONFIRMED — reschedule ACCEPT round-trip (client → owner accepts → moves).
    { id: "seed-vision-elena-accept", status: BookingStatus.CONFIRMED, start: dateAtLocalUtc(3, 13) },
    // Future CONFIRMED (separate slot) — reschedule DECLINE round-trip (owner declines → stays).
    { id: "seed-vision-elena-decline", status: BookingStatus.CONFIRMED, start: dateAtLocalUtc(4, 15) },
    // Elapsed FINISHED (~yesterday, inside the 3-day review window) — self-review block + client control.
    { id: "seed-vision-elena-review", status: BookingStatus.FINISHED, start: dateAtLocalUtc(-1, 13) },
  ];

  for (const plan of plans) {
    const endAt = new Date(plan.start.getTime() + service.durationMin * 60_000);
    const data = {
      providerId: studioProvider.id, // STUDIO provider id
      studioId: studio.id,
      serviceId: service.id,
      masterProviderId: master.id, // MASTER provider id
      masterId: master.id,
      clientUserId: client.id,
      startAtUtc: plan.start,
      endAtUtc: endAt,
      slotLabel: plan.start.toISOString(),
      clientName,
      clientPhone,
      clientNameSnapshot: clientName,
      clientPhoneSnapshot: clientPhone,
      status: plan.status,
      source: BookingSource.WEB,
      requestedBy: null,
      actionRequiredBy: null,
    };

    const booking = await prisma.booking.upsert({
      where: { id: plan.id },
      update: data,
      create: { id: plan.id, ...data },
    });

    // Priced BookingServiceItem snapshot (revenue/KPI + analytics use these).
    await prisma.bookingServiceItem.deleteMany({ where: { bookingId: booking.id } });
    await prisma.bookingServiceItem.create({
      data: {
        bookingId: booking.id,
        studioId: studio.id,
        serviceId: service.id,
        titleSnapshot: service.name,
        priceSnapshot: service.price,
        durationSnapshotMin: service.durationMin,
      },
    });
  }

  logSeed.step(
    `Showcase: ${plans.length} Vision↔Елена bookings (accept/decline/review) for studio-booking E2E`
  );
  return plans.length;
}
