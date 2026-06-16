import { cache } from "react";
import { DiscountType, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProviderProfile } from "@/lib/providers/usecases";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { PlanTier } from "@/lib/billing/features";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { normalizeSlotStepMin } from "@/lib/schedule/editor-shared";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { logError } from "@/lib/logging/logger";

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
  // Rule 12 (RULE-12-PROVIDERS): no internal package CUID on the public profile —
  // the bundle is display-only (no per-bundle action keyed by id).
  name: string;
  serviceNames: string[];
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
          // QA-115: studio affiliation (studioId references the studio's provider row).
          studio: { select: { name: true, publicUsername: true, isPublished: true } },
        },
      }),
      prisma.servicePackage.findMany({
        where: { masterId: provider.id, isEnabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        // Rule 12 (RULE-12-PROVIDERS): explicit select — the bundle mapping only
        // needs name/discount + items; never expose the raw row's internal
        // CUIDs/timestamps (id, masterId, createdAt, updatedAt) to the client.
        select: {
          name: true,
          discountType: true,
          discountValue: true,
          items: {
            select: {
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
    );

    const bundles = packages
      .map((pkg) => {
        const items = [...pkg.items].sort(
          (a, b) => a.service.sortOrder - b.service.sortOrder,
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
        const hasDisabledComponent = items.some((item) => !item.service.isEnabled);
        return {
          name: pkg.name,
          serviceNames,
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
        name: bundle.name,
        serviceNames: bundle.serviceNames,
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
    const studio = studioRow
      ? {
          name: studioRow.name,
          publicUsername: studioRow.isPublished ? studioRow.publicUsername : null,
        }
      : null;

    return {
      provider,
      bundles,
      planTier,
      experienceMonths,
      availability,
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
): Promise<AvailabilityHint> {
  try {
    const now = new Date();
    const todayKey = toLocalDateKey(now, timezone);
    const toKeyExclusive = addDaysToDateKey(todayKey, AVAILABILITY_PROBE_DAYS);
    const ctx = await createScheduleContext({
      providerId,
      timezoneHint: timezone,
      range: { fromKey: todayKey, toKeyExclusive },
    });

    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { masterProviderId: providerId },
          { masterProviderId: null, providerId },
        ],
        status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
        startAtUtc: { gte: now },
      },
      select: { startAtUtc: true, endAtUtc: true },
    });

    const bookingsByDateKey = new Map<
      string,
      Array<{ startAtUtc: Date; endAtUtc: Date }>
    >();
    for (const booking of bookings) {
      if (!booking.startAtUtc || !booking.endAtUtc) continue;
      const key = toLocalDateKey(booking.startAtUtc, timezone);
      const list = bookingsByDateKey.get(key) ?? [];
      list.push({ startAtUtc: booking.startAtUtc, endAtUtc: booking.endAtUtc });
      bookingsByDateKey.set(key, list);
    }

    let cursor = todayKey;
    for (let i = 0; i < AVAILABILITY_PROBE_DAYS; i += 1) {
      const plan = await ScheduleEngine.getDayPlanFromContext(ctx, cursor);
      if (plan.isWorking) {
        const slots = buildSlotsForDay({
          dayPlan: plan,
          dateKey: cursor,
          timeZone: timezone,
          serviceDurationMin: AVAILABILITY_PROBE_DURATION_MIN,
          bufferMin: 0,
          bookings: bookingsByDateKey.get(cursor) ?? [],
          now,
          slotStepMin,
        });
        const upcoming = slots.find((slot) => slot.startAtUtc.getTime() >= now.getTime());
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
