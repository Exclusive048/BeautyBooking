/**
 * ============================================================
 * STUDIO-SEED-01 — QA fixture layer for the bulk studio «Аура»
 * ============================================================
 *
 * `seed-providers.ts` now builds every bulk studio *structurally* correct
 * (owner StudioMembership → no 403; dedicated masters carrying
 * `Provider.studioId` → bookable). This module layers the QA-grade detail
 * on top of ONE of them — «Аура» (`studio-aura-1`), the studio Артём hit —
 * so every studio surface has something real to show:
 *
 *   • a recurring lunch BREAK on master 1 and a DAY OFF on master 2
 *     (slot-computation edges are testable, not just the happy path)
 *   • a ServicePackage on the studio (studio package booking is testable —
 *     see also PACKAGE-STUDIO-SAME-MASTER-BUFFER in BACKLOG.md)
 *   • bookings across the statuses the studio surfaces branch on:
 *     upcoming CONFIRMED, recent FINISHED (inside the review window),
 *     and CHANGE_REQUESTED (the two-sided reschedule surface, invariant #32)
 *
 * Logins (OTP goes to the server log in dev — SMS gateway is off):
 *   +7 900 000 01 50  — Кира Белова, studio OWNER → /cabinet/studio
 *   +7 900 000 02 00  — studio master #1 (has the lunch break) → /cabinet/master
 *   +7 900 000 02 01  — studio master #2 (has the day off)
 *   +7 900 000 02 02  — studio master #3
 *
 * Runs AFTER seedProviders (needs the studio + its team) and AFTER
 * seedClients (needs someone to book). Everything resolves by stable key
 * and throws loudly on a missing dependency — a silently-skipped fixture
 * would make the QA pass prove nothing.
 *
 * Dates are relative-to-now (SEED-FRESHNESS pattern) and computed in the
 * studio's own timezone, never naive UTC.
 */
import {
  BookingSource,
  BookingStatus,
  DiscountType,
  ScheduleOverrideKind,
  type Service,
} from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";

const STUDIO_USERNAME = "studio-aura-1";
const PACKAGE_ID = "seed-aura-package-01";

function startOfUtcDay(date: Date): Date {
  const out = new Date(date);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

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
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - at.getTime();
}

/** Salon-local `hour:minute`, `offsetDays` from today, returned as the UTC instant. */
function dateAtLocalUtc(offsetDays: number, hour: number, timeZone: string, minute = 0): Date {
  const day = startOfUtcDay(new Date());
  day.setUTCDate(day.getUTCDate() + offsetDays);
  const guess = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, 0, 0),
  );
  return new Date(guess.getTime() - tzOffsetMs(guess, timeZone));
}

export async function seedStudioQa(): Promise<number> {
  logSeed.section("Studio QA fixture («Аура»)");

  const studioProvider = await prisma.provider.findFirst({
    where: { publicUsername: STUDIO_USERNAME },
    select: { id: true, name: true, timezone: true },
  });
  if (!studioProvider) {
    throw new Error(`seed-studio-qa: studio provider ${STUDIO_USERNAME} not found — run seedProviders first.`);
  }
  const studio = await prisma.studio.findFirst({
    where: { providerId: studioProvider.id },
    select: { id: true },
  });
  if (!studio) {
    throw new Error(`seed-studio-qa: Studio row for ${STUDIO_USERNAME} not found.`);
  }
  const tz = studioProvider.timezone;

  // Team, ordered by slug so master #1/#2/#3 are stable across runs.
  const team = await prisma.provider.findMany({
    where: { studioId: studioProvider.id, type: "MASTER", ownerUserId: { not: null }, studioPaused: false },
    select: { id: true, name: true, publicUsername: true, ownerUserId: true },
    orderBy: { publicUsername: "asc" },
  });
  if (team.length < 3) {
    throw new Error(
      `seed-studio-qa: expected >=3 ACTIVE masters in ${STUDIO_USERNAME}, found ${team.length}. ` +
        `seedProviders must set Provider.studioId + ownerUserId (studioPaused stays false).`,
    );
  }

  // ---- 1. Recurring lunch break on master #1 ----
  // A recurring break is a **ScheduleTemplateBreak on the template**, NOT a
  // `ScheduleBreak{kind: WEEKLY}` row: every read path (engine-context.ts,
  // editor.ts, unified.ts) queries `ScheduleBreak` with `kind: "OVERRIDE"`
  // only, so a WEEKLY row is inert and the slot grid would still offer 13:00.
  // The weekly config points every active day at this one template, so one
  // template break = lunch on each working day.
  const template = await prisma.scheduleTemplate.findFirst({
    where: { providerId: team[0]!.id },
    select: { id: true },
  });
  if (!template) {
    throw new Error(`seed-studio-qa: master ${team[0]!.publicUsername} has no ScheduleTemplate.`);
  }
  await prisma.scheduleTemplateBreak.deleteMany({ where: { templateId: template.id } });
  await prisma.scheduleTemplateBreak.create({
    data: { templateId: template.id, startLocal: "13:00", endLocal: "14:00", sortOrder: 0, title: "Обед" },
  });

  // ---- 2. Day off on master #2 (relative: the day after tomorrow) ----
  const dayOffDate = startOfUtcDay(new Date());
  dayOffDate.setUTCDate(dayOffDate.getUTCDate() + 2);
  await prisma.scheduleOverride.deleteMany({
    where: { providerId: team[1]!.id, date: dayOffDate },
  });
  await prisma.scheduleOverride.create({
    data: {
      providerId: team[1]!.id,
      date: dayOffDate,
      kind: ScheduleOverrideKind.OFF,
      isDayOff: true,
      isWorkday: false,
      isActive: true,
      note: "Выходной",
      reason: "Личный день",
    },
  });

  // ---- 3. Package on the studio (2 components) ----
  const studioServices = await prisma.service.findMany({
    where: { providerId: studioProvider.id, isEnabled: true },
    select: { id: true, name: true, price: true, durationMin: true },
    orderBy: { name: "asc" },
  });
  if (studioServices.length < 2) {
    throw new Error(
      `seed-studio-qa: need >=2 enabled studio services to build a package, found ${studioServices.length}.`,
    );
  }
  await prisma.servicePackage.deleteMany({ where: { id: PACKAGE_ID } });
  await prisma.servicePackage.create({
    data: {
      id: PACKAGE_ID,
      masterId: studioProvider.id, // studio-level package (masterId = provider id)
      name: "Комплекс «Аура»",
      discountType: DiscountType.PERCENT,
      discountValue: 15,
      isEnabled: true,
      sortOrder: 0,
      items: {
        create: [
          { serviceId: studioServices[0]!.id, sortOrder: 0 },
          { serviceId: studioServices[1]!.id, sortOrder: 1 },
        ],
      },
    },
  });

  // ---- 4. Bookings across the statuses the studio surfaces branch on ----
  const client = await prisma.userProfile.findFirst({
    where: { phone: { startsWith: "+790000001" } }, // seed client band (0100..0149)
    select: { id: true, displayName: true, firstName: true, phone: true },
    orderBy: { phone: "asc" },
  });
  if (!client) {
    throw new Error("seed-studio-qa: no seed client found (phone band +790000001xx) — run seedClients first.");
  }
  const clientName = client.displayName ?? client.firstName ?? "Клиент";
  const clientPhone = client.phone ?? "";

  // Each booking is assigned to a master that actually performs the service —
  // otherwise the studio calendar shows a booking its master can't fulfil.
  async function serviceForMaster(masterProviderId: string): Promise<Service | null> {
    const link = await prisma.masterService.findFirst({
      where: { masterProviderId, isEnabled: true },
      select: { serviceId: true },
    });
    if (!link) return null;
    return prisma.service.findUnique({ where: { id: link.serviceId } });
  }

  const plans: Array<{
    id: string;
    status: BookingStatus;
    masterIndex: number;
    start: Date;
    actionRequiredBy: "MASTER" | "CLIENT" | null;
    proposedStartAt: Date | null;
  }> = [
    {
      id: "seed-aura-qa-confirmed",
      status: BookingStatus.CONFIRMED,
      masterIndex: 0,
      start: dateAtLocalUtc(3, 11, tz),
      actionRequiredBy: null,
      proposedStartAt: null,
    },
    {
      id: "seed-aura-qa-finished",
      status: BookingStatus.FINISHED,
      masterIndex: 1,
      start: dateAtLocalUtc(-1, 12, tz),
      actionRequiredBy: null,
      proposedStartAt: null,
    },
    {
      id: "seed-aura-qa-change-requested",
      status: BookingStatus.CHANGE_REQUESTED,
      masterIndex: 2,
      start: dateAtLocalUtc(5, 15, tz),
      actionRequiredBy: "CLIENT",
      proposedStartAt: dateAtLocalUtc(6, 16, tz),
    },
  ];

  let created = 0;
  for (const plan of plans) {
    const master = team[plan.masterIndex]!;
    const service = await serviceForMaster(master.id);
    if (!service) {
      throw new Error(
        `seed-studio-qa: master ${master.publicUsername} has no MasterService link — ` +
          `seedProviders must create them.`,
      );
    }
    const endAt = new Date(plan.start.getTime() + service.durationMin * 60_000);
    const data = {
      providerId: studioProvider.id,
      studioId: studio.id,
      serviceId: service.id,
      masterProviderId: master.id,
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
      proposedStartAt: plan.proposedStartAt,
      actionRequiredBy: plan.actionRequiredBy,
    };
    const booking = await prisma.booking.upsert({
      where: { id: plan.id },
      update: data,
      create: { id: plan.id, ...data },
    });
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
    created++;
  }

  logSeed.ok(
    `«Аура»: ${team.length} ACTIVE masters · lunch break + day off · 1 package · ${created} bookings`,
  );
  return created;
}
