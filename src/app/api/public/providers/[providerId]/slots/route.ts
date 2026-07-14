import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { clampVisibleSlotsHorizon } from "@/lib/bookings/policy-enforcement";
import { listBookableSlots } from "@/lib/schedule/bookable-window";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapSlotsError(code?: string): string {
  switch (code) {
    case "SERVICE_REQUIRED":
      return "Не указана услуга.";
    case "DURATION_INVALID":
      return "Некорректная длительность услуги.";
    case "DATE_INVALID":
      return "Некорректная дата.";
    case "RANGE_INVALID":
      return "Некорректный диапазон.";
    case "PROVIDER_NOT_FOUND":
    case "MASTER_NOT_FOUND":
      return "Мастер не найден.";
    case "SERVICE_NOT_FOUND":
      return "Услуга не найдена.";
    case "SERVICE_INVALID":
      return "Услуга недоступна для мастера.";
    case "SERVICE_DISABLED":
      return "Услуга недоступна.";
    default:
      return "Не удалось загрузить окошки.";
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> | { providerId: string } }
) {
  const p = params instanceof Promise ? await params : params;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const fromKey = url.searchParams.get("from") ?? "";
  const toKey = url.searchParams.get("to") ?? "";
  const limitRaw = url.searchParams.get("limit");

  if (!serviceId) return fail("Не указана услуга.", 400, "SERVICE_REQUIRED");
  if (!isDateKey(fromKey)) return fail("Некорректная дата.", 400, "DATE_INVALID");
  if (toKey && !isDateKey(toKey)) return fail("Некорректная дата.", 400, "DATE_INVALID");

  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  if (limitRaw && !Number.isFinite(limit)) {
    return fail("Некорректный лимит.", 400, "LIMIT_INVALID");
  }

  const provider = await resolveProviderBySlugOrId({
    key: p.providerId,
    select: {
      id: true,
      type: true,
      timezone: true,
      // BOOKING-WIDGET-A: policy fields are needed for the visible-window
      // clamp + min-hours filter below. Keep selection narrow.
      minBookingHoursAhead: true,
      visibleSlotDays: true,
    },
    requirePublished: true,
  });
  if (!provider || provider.type !== "MASTER") {
    return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  const duration = await resolveServiceDuration(provider.id, serviceId);
  if (!duration.ok) {
    return fail(mapSlotsError(duration.code), duration.status, duration.code);
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, price: true },
  });
  if (!service) return fail("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");

  // BOOKING-WIDGET-A: clamp the requested horizon to
  // `Provider.visibleSlotDays`. The cabinet-side schedule editor stores
  // this value as the "catalog visibility" knob — this clamp is
  // public-discovery-specific and stays route-local (the authenticated
  // `/availability` reschedule surface is bounded by `maxBookingDaysAhead`
  // instead — see bookable-window.ts).
  const nowForPolicy = new Date();
  const clampedToKey = clampVisibleSlotsHorizon(toKey || null, provider, nowForPolicy, provider.timezone);
  const effectiveToKeyExclusive = clampedToKey
    ? addDaysToDateKey(clampedToKey, 1)
    : toKey || undefined;

  // EXP-025/026: the shared bookable-window primitive applies the
  // `minBookingHoursAhead` cutoff + effective weekly/override schedule
  // filter. `/availability` calls the SAME helper so the two endpoints
  // can't re-diverge. The DiscountRule fetch stays here (hot-slot pricing
  // is `/slots`-only) and runs in parallel.
  const [bookable, rule] = await Promise.all([
    listBookableSlots({
      provider,
      serviceId,
      durationMinutes: duration.data,
      fromKey,
      toKeyExclusive: effectiveToKeyExclusive,
      limit,
      now: nowForPolicy,
    }),
    prisma.discountRule.findUnique({
      where: { providerId: provider.id },
      select: {
        isEnabled: true,
        triggerHours: true,
        discountType: true,
        discountValue: true,
        applyMode: true,
        minPriceFrom: true,
        serviceIds: true,
      },
    }),
  ]);
  if (!bookable.ok) {
    return fail(mapSlotsError(bookable.code), bookable.status, bookable.code);
  }

  const baseSlots = bookable.slots;

  type SlotLike = (typeof baseSlots)[number] & {
    hotSlotId?: string | null;
    isHot?: boolean;
    discountType?: "PERCENT" | "FIXED";
    discountValue?: number;
    originalPrice?: number | null;
    discountedPrice?: number | null;
    discountPercent?: number | null;
  };

  const now = new Date();
  const decoratedSlots: SlotLike[] = baseSlots.map((slot) => {
    const startAtUtc = toDate(slot.startAtUtc);
    if (!startAtUtc) {
      return {
        ...slot,
        hotSlotId: null,
        isHot: false,
        discountType: undefined,
        discountValue: undefined,
        originalPrice: null,
        discountedPrice: null,
        discountPercent: null,
      };
    }

    const hot = resolveDynamicHotSlotPricing({
      rule,
      slotStartAtUtc: startAtUtc,
      serviceId,
      servicePrice: service.price,
      providerTimeZone: provider.timezone,
      now,
    });

    return {
      ...slot,
      hotSlotId: null,
      isHot: hot.isHot,
      discountType: hot.discountType,
      discountValue: hot.discountValue,
      originalPrice: hot.originalPrice,
      discountedPrice: hot.discountedPrice,
      discountPercent: hot.discountPercent,
    };
  });

  const serializedSlots = decoratedSlots.map((slot) => ({
    ...slot,
    startAtUtc: toIso(slot.startAtUtc),
    endAtUtc: toIso(slot.endAtUtc),
  }));

  return ok({ timezone: provider.timezone, slots: serializedSlots, meta: bookable.meta });
}
