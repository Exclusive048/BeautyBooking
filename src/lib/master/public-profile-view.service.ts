import { cache } from "react";
import { DiscountType, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOccupancyBookingWhere, resolveOccupancyProviderIds } from "@/lib/schedule/occupancy";
import { getProviderProfile } from "@/lib/providers/usecases";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { PlanTier } from "@/lib/billing/features";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { normalizeSlotStepMin } from "@/lib/schedule/editor-shared";
import { addDaysToDateKey, localDayRangeUtc } from "@/lib/schedule/dateKey";
import { buildBookingOverlapWhere, bookingOverlapsRange } from "@/lib/schedule/overlap";
import { loadTimeBlockRanges } from "@/lib/schedule/time-blocks";
import { earliestBookableUtc } from "@/lib/bookings/policy-enforcement";
import { normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { logError } from "@/lib/logging/logger";
import { ACTIVE_STUDIO_PROFILE_SELECT, pickActiveStudioProfile } from "@/lib/providers/studio-profile";

/**
 * Aggregator for `/u/[username]` master public profile (32a).
 *
 * One server call returns everything the redesigned profile needs:
 * canonical `ProviderProfileDto` (reuses `getProviderProfile`), the
 * master's read-only bundle catalog (31c), the active plan tier (for
 * the PREMIUM ring + badge), `experienceMonths` derived from
 * `provider.createdAt`, and an availability hint — the earliest free
 * slot today (or next working day). Wrapped in React `cache()` so
 * sections can call it freely; one Prisma roundtrip per request.
 */

export type PublicBundleView = {
  // PACKAGE-BOOKING-MVP-1: the bundle is now bookable, so the package `id` +
  // component `serviceId`s are exposed (booking-flow carve-out to Rule 12,
  // same as providerId/serviceId in the single-booking widget).
  id: string;
  name: string;
  serviceNames: string[];
  /** Components in package `sortOrder` — the sequence the booking places them in. */
  components: Array<{ serviceId: string; name: string; price: number; durationMin: number }>;
  totalDurationMin: number;
  totalPrice: number;
  finalPrice: number;
  discountAmount: number;
  discountType: DiscountType;
  discountValue: number;
};

export type AvailabilityHint =
  | { kind: "today"; time: string }
  | { kind: "later"; dateKey: string }
  | { kind: "none" };

export type MasterPublicProfileView = {
  provider: ProviderProfileDto;
  bundles: PublicBundleView[];
  planTier: PlanTier | null;
  experienceMonths: number | null;
  availability: AvailabilityHint;
  /**
   * PACKAGE-SOLO-WIZARD-01: the master's normalized between-bookings buffer, in
   * minutes. The package wizard needs it client-side because
   * `createSoloPackageBooking` requires this gap BETWEEN two package siblings
   * (`intraPackageOverlap`), and the slots API can't express it — the sibling
   * isn't committed yet, so its window still reads free. Without it the wizard
   * would offer a slot the create then rejects with 409.
   */
  providerBufferMin: number;
  /**
   * QA-115 (FIX-06): studio affiliation when the master belongs to a studio.
   * `publicUsername` is the studio's *public* identifier for the profile link
   * (rule 12 — never an internal id); `null` when the studio isn't publicly
   * linkable (unpublished / no username) → name shown without a link.
   * `null` overall for independent masters.
   */
  studio: { name: string; publicUsername: string | null } | null;
};

const AVAILABILITY_PROBE_DURATION_MIN = 30;
const AVAILABILITY_PROBE_DAYS = 8;

export const getMasterPublicProfileView = cache(
  async (providerId: string): Promise<MasterPublicProfileView | null> => {
    if (!providerId) return null;

    let provider: ProviderProfileDto;
    try {
      provider = await getProviderProfile(providerId);
    } catch {
      return null;
    }
    if (provider.type !== "MASTER") return null;

    // Rule 12 (RULE-12-OWNERUSERID-RSC, FIX-17): the serialized row must carry
    // NO internal user CUID. `ownerUserId` is needed only as a server-side arg
    // for `getCurrentPlan`, so it's fetched separately into a local primitive
    // below — never kept on a row that crosses into the RSC flight payload.
    const [ownerMeta, packages] = await Promise.all([
      prisma.provider.findUnique({
        where: { id: provider.id },
        select: {
          createdAt: true,
          slotStepMin: true,
          // EXP-023: the availability chip must respect the same booking-window
          // cutoff + buffer the booking widget applies, so it shows the FIRST
          // actually-bookable slot (not the next raw schedule step after now).
          minBookingHoursAhead: true,
          bufferBetweenBookingsMin: true,
          // QA-115: studio affiliation (studioId references the studio's provider row).
          studio: { select: { name: true, publicUsername: true, isPublished: true } },
          // STUDIO-MASTER-PROFILES (этап 4): после разделения студия — у профиля
          // мастера в студии; тем же запросом.
          ...ACTIVE_STUDIO_PROFILE_SELECT,
        },
      }),
      prisma.servicePackage.findMany({
        where: { masterId: provider.id, isEnabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        // Rule 12: explicit select. PACKAGE-BOOKING-MVP-1 — the package `id`
        // and component `serviceId`s are now exposed because the bundle is
        // bookable; this is the accepted booking-flow carve-out (same as
        // providerId/serviceId already used by /api/public/bookings —
        // RULE-12-BOOKING-CONTRACT-OPTIONAL). Still never expose masterId /
        // timestamps.
        select: {
          id: true,
          name: true,
          discountType: true,
          discountValue: true,
          items: {
            select: {
              serviceId: true,
              sortOrder: true,
              service: {
                select: {
                  id: true,
                  name: true,
                  title: true,
                  durationMin: true,
                  price: true,
                  isEnabled: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Transient primitive — the intermediate row is discarded immediately, so
    // the owner UserProfile CUID never persists on an object that reaches flight.
    const ownerUserId =
      (
        await prisma.provider.findUnique({
          where: { id: provider.id },
          select: { ownerUserId: true },
        })
      )?.ownerUserId ?? null;
    const createdAt = ownerMeta?.createdAt ?? null;

    // RULE-12-SCHEDULE (FIX-19): `getCurrentPlan` returns a rich `CurrentPlanInfo`
    // (with the BillingPlan `planId` CUID) but only `.tier` is needed here. The old
    // `Promise.all([planInfo, availability])` tuple flight-serialized the whole
    // `planInfo` (leaking `planId`) — same RSC mechanism as `ownerUserId`/schedule.
    // Extract the `tier` primitive immediately; never keep the rich object in a
    // flight-reachable structure. Sequential awaits (read-only) keep behaviour identical.
    const planInfoRaw = ownerUserId
      ? await getCurrentPlan(ownerUserId, SubscriptionScope.MASTER).catch(() => null)
      : null;
    const planTier: PlanTier | null = planInfoRaw?.tier ?? null;
    const availability = await computeAvailabilityHint(
      provider.id,
      provider.timezone,
      normalizeSlotStepMin(ownerMeta?.slotStepMin),
      Math.max(0, ownerMeta?.minBookingHoursAhead ?? 0),
      normalizeBufferMinutes(ownerMeta?.bufferBetweenBookingsMin),
    );

    const bundles = packages
      .map((pkg) => {
        // PACKAGE-BOOKING-MVP-1: order by the package's own item.sortOrder so
        // the displayed sequence == the booked sequential placement order.
        const items = [...pkg.items].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.service.sortOrder - b.service.sortOrder,
        );
        const totalPrice = items.reduce((sum, item) => sum + item.service.price, 0);
        const totalDurationMin = items.reduce(
          (sum, item) => sum + item.service.durationMin,
          0,
        );
        const discountAmount =
          pkg.discountType === DiscountType.PERCENT
            ? Math.round((totalPrice * pkg.discountValue) / 100)
            : Math.min(totalPrice, pkg.discountValue);
        const finalPrice = Math.max(0, totalPrice - discountAmount);
        const serviceNames = items.map(
          (item) => item.service.title?.trim() || item.service.name,
        );
        const components = items.map((item) => ({
          serviceId: item.serviceId,
          name: item.service.title?.trim() || item.service.name,
          price: item.service.price,
          durationMin: item.service.durationMin,
        }));
        const hasDisabledComponent = items.some((item) => !item.service.isEnabled);
        return {
          id: pkg.id,
          name: pkg.name,
          serviceNames,
          components,
          totalDurationMin,
          totalPrice,
          finalPrice,
          discountAmount,
          discountType: pkg.discountType,
          discountValue: pkg.discountValue,
          hasDisabledComponent,
        };
      })
      .filter((bundle) => !bundle.hasDisabledComponent)
      .map((bundle): PublicBundleView => ({
        id: bundle.id,
        name: bundle.name,
        serviceNames: bundle.serviceNames,
        components: bundle.components,
        totalDurationMin: bundle.totalDurationMin,
        totalPrice: bundle.totalPrice,
        finalPrice: bundle.finalPrice,
        discountAmount: bundle.discountAmount,
        discountType: bundle.discountType,
        discountValue: bundle.discountValue,
      }));

    const experienceMonths = createdAt
      ? computeMonthsBetween(createdAt, new Date())
      : null;

    // QA-115: only expose a public link when the studio is published + has a
    // public username; otherwise show the name without a link (no CUID leak).
    const studioRow = ownerMeta?.studio ?? null;
    // STUDIO-MASTER-PROFILES (этап 4): после разделения студия — у профиля
    // мастера в студии, а не у личного.
    const studioProfile = studioRow ? null : pickActiveStudioProfile(ownerMeta);
    const studio = studioRow
      ? {
          name: studioRow.name,
          publicUsername: studioRow.isPublished ? studioRow.publicUsername : null,
        }
      : studioProfile
        ? { name: studioProfile.studioName, publicUsername: studioProfile.studioPublicUsername }
        : null;

    return {
      provider,
      bundles,
      planTier,
      experienceMonths,
      availability,
      // PACKAGE-SOLO-WIZARD-01 — same normalization the booking core applies,
      // so the wizard's cursor matches the create's `intraPackageOverlap` gap.
      providerBufferMin: normalizeBufferMinutes(ownerMeta?.bufferBetweenBookingsMin),
      studio,
    };
  },
);

function computeMonthsBetween(from: Date, to: Date): number {
  const years = to.getUTCFullYear() - from.getUTCFullYear();
  const months = to.getUTCMonth() - from.getUTCMonth();
  return Math.max(0, years * 12 + months);
}

async function computeAvailabilityHint(
  providerId: string,
  timezone: string,
  slotStepMin: number,
  minBookingHoursAhead: number,
  bufferMin: number,
): Promise<AvailabilityHint> {
  try {
    const now = new Date();
    // EXP-023: the first BOOKABLE slot is at/after `now + minBookingHoursAhead`,
    // not just at/after `now`. `earliestBookableUtc` is the SAME cutoff
    // primitive `listBookableSlots` (EXP-025) applies, so the chip's time
    // matches the first slot the booking widget actually offers.
    const earliestBookable = earliestBookableUtc({ minBookingHoursAhead }, now);
    const todayKey = toLocalDateKey(now, timezone);
    const toKeyExclusive = addDaysToDateKey(todayKey, AVAILABILITY_PROBE_DAYS);
    const ctx = await createScheduleContext({
      providerId,
      timezoneHint: timezone,
      range: { fromKey: todayKey, toKeyExclusive },
    });

    // FIX-8 (HARDENING-04): fetch the conflict set by OVERLAP with the probe
    // window, then bucket per day by overlap — NOT `startAtUtc >= now` keyed by
    // start-day. The old approach dropped in-progress bookings (started before
    // `now`) and mis-filed cross-midnight bookings under the PREVIOUS day, so
    // the profile advertised a nearest slot sitting under an ongoing/overnight
    // appointment (which then 409s at submit). Same overlap primitive the
    // engine uses. The slot HORIZON is unchanged — the `earliestBookable`
    // cutoff below still gates which slots are offered.
    const lastProbeDayKey = addDaysToDateKey(todayKey, AVAILABILITY_PROBE_DAYS - 1);
    const probeWindowStartUtc = localDayRangeUtc(todayKey, timezone).startUtc;
    const probeWindowEndUtc = localDayRangeUtc(lastProbeDayKey, timezone).endExclusiveUtc;
    const bookingRows = await prisma.booking.findMany({
      where: {
        // STUDIO-MASTER-PROFILES: занятость — по всем профилям человека.
        ...buildOccupancyBookingWhere(await resolveOccupancyProviderIds(prisma, providerId)),
        status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
        ...buildBookingOverlapWhere(probeWindowStartUtc, probeWindowEndUtc),
      },
      select: { startAtUtc: true, endAtUtc: true },
    });
    const activeBookings = bookingRows.filter(
      (booking): booking is { startAtUtc: Date; endAtUtc: Date } =>
        booking.startAtUtc !== null && booking.endAtUtc !== null,
    );
    const bookingsForDay = (dateKey: string): Array<{ startAtUtc: Date; endAtUtc: Date }> => {
      const { startUtc, endExclusiveUtc } = localDayRangeUtc(dateKey, timezone);
      return activeBookings.filter((booking) =>
        bookingOverlapsRange(booking, startUtc, endExclusiveUtc),
      );
    };

    // FIX-TIMEBLOCK-ENFORCEMENT-01: the "nearest slot" hint must skip TimeBlock
    // windows too — same probe window + per-day overlap bucketing as bookings.
    const blockRanges = await loadTimeBlockRanges(providerId, probeWindowStartUtc, probeWindowEndUtc);
    const blocksForDay = (dateKey: string): Array<{ startAtUtc: Date; endAtUtc: Date }> => {
      const { startUtc, endExclusiveUtc } = localDayRangeUtc(dateKey, timezone);
      return blockRanges.filter((block) => bookingOverlapsRange(block, startUtc, endExclusiveUtc));
    };

    let cursor = todayKey;
    for (let i = 0; i < AVAILABILITY_PROBE_DAYS; i += 1) {
      const plan = await ScheduleEngine.getDayPlanFromContext(ctx, cursor);
      if (plan.isWorking) {
        const slots = buildSlotsForDay({
          dayPlan: plan,
          dateKey: cursor,
          timeZone: timezone,
          serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
          // EXP-023: use the provider's real between-bookings buffer (was 0) so
          // the probe pads existing bookings exactly as the widget does.
          bufferMin,
          bookings: bookingsForDay(cursor),
          blocks: blocksForDay(cursor),
          now,
          slotStepMin,
        });
        // EXP-023: first slot at/after the min-booking-ahead cutoff (was `now`).
        const upcoming = slots.find(
          (slot) => slot.startAtUtc.getTime() >= earliestBookable.getTime(),
        );
        if (upcoming) {
          if (i === 0) {
            return {
              kind: "today",
              time: formatLocalTime(upcoming.startAtUtc, timezone),
            };
          }
          return { kind: "later", dateKey: cursor };
        }
      }
      cursor = addDaysToDateKey(cursor, 1);
    }
    return { kind: "none" };
  } catch (error) {
    logError("public-profile.availability-hint.failed", {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: "none" };
  }
}

function formatLocalTime(utc: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  return formatter.format(utc);
}
