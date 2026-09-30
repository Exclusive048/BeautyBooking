import { ok, fail } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { clampVisibleSlotsHorizon } from "@/lib/bookings/policy-enforcement";
import { listBookableSlots } from "@/lib/schedule/bookable-window";
import { resolveRescheduleExclusion } from "@/lib/schedule/reschedule-exclusion";
import { isActiveMasterOfPublishedStudio } from "@/lib/studio/active-studio-master";

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
      return "Проверьте длительность услуги.";
    case "DATE_INVALID":
      return "Проверьте дату.";
    case "RANGE_INVALID":
      return "Проверьте выбранный период.";
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
  // RES-13: без этого конверта неожиданный throw (ошибка Prisma, битая tz)
  // отдаёт дефолтную HTML-страницу 500 Next вместо `{ ok:false, error }` —
  // слот-пикер разбирает JSON и получает нераспарсиваемый ответ.
  try {
    const p = params instanceof Promise ? await params : params;
    const url = new URL(req.url);
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const fromKey = url.searchParams.get("from") ?? "";
    const toKey = url.searchParams.get("to") ?? "";
    const limitRaw = url.searchParams.get("limit");

    if (!serviceId) return fail("Не указана услуга.", 400, "SERVICE_REQUIRED");
    if (!isDateKey(fromKey)) return fail("Проверьте дату.", 400, "DATE_INVALID");
    if (toKey && !isDateKey(toKey)) return fail("Проверьте дату.", 400, "DATE_INVALID");

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    if (limitRaw && !Number.isFinite(limit)) {
      return fail("Слишком много дней за раз. Выберите период короче.", 400, "LIMIT_INVALID");
    }

    const providerSelect = {
      id: true,
      type: true,
      timezone: true,
      // BOOKING-WIDGET-A: policy fields are needed for the visible-window
      // clamp + min-hours filter below. Keep selection narrow.
      minBookingHoursAhead: true,
      visibleSlotDays: true,
    } as const;
    // STUDIO-MASTER-PROFILES (этап 4): у профиля мастера в студии публичной
    // страницы нет, а окошки ему нужны — перенос студийной записи клиентом
    // идёт сюда. Мастер, активный в опубликованной студии, отдаёт окошки и без
    // своей страницы (то же правило, что у `/availability`).
    let provider = await resolveProviderBySlugOrId({
      key: p.providerId,
      select: providerSelect,
      requirePublished: true,
    });
    if (!provider) {
      const candidate = await resolveProviderBySlugOrId({ key: p.providerId, select: providerSelect });
      if (candidate && (await isActiveMasterOfPublishedStudio(candidate.id))) {
        provider = candidate;
      } else if (candidate) {
        // Перенос СУЩЕСТВУЮЩЕЙ записи: студия скрыта или мастер в ней на паузе —
        // новых записей нет, а существующие переносятся как прежде
        // (STUDIO-HIDDEN-MASTER-SERVICES, STUDIO-PAUSE-SPLIT-01). До разделения
        // исполнителем был опубликованный личный профиль, и это работало само;
        // у профиля в студии страницы нет. Пускаем только сторону переносимой
        // записи — то же право, что проверяется ниже (сессия клиента или
        // подписанная ссылка гостя; чужому — 401/404 без окошек).
        const exclusionBookingId = url.searchParams.get("excludeBookingId");
        if (exclusionBookingId && (await resolveRescheduleExclusion(req, candidate.id, exclusionBookingId))) {
          provider = candidate;
        }
      }
    }
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

    // RESCHEDULE-SELF-SLOT: окно переносимой брони не занято — только для
    // сторон этой брони (см. reschedule-exclusion.ts); аноним без сессии — 401.
    // MOVE-PICKER-DURATION: окошки переноса — по длине самой записи.
    const exclusion = await resolveRescheduleExclusion(
      req,
      provider.id,
      url.searchParams.get("excludeBookingId"),
    );

    // EXP-025/026: the shared bookable-window primitive applies the
    // `minBookingHoursAhead` cutoff + effective weekly/override schedule
    // filter. `/availability` calls the SAME helper so the two endpoints
    // can't re-diverge. The DiscountRule fetch stays here (hot-slot pricing
    // is `/slots`-only) and runs in parallel.
    const [bookable, rule] = await Promise.all([
      listBookableSlots({
        provider,
        serviceId,
        durationMinutes: exclusion && exclusion.durationMin > 0 ? exclusion.durationMin : duration.data,
        fromKey,
        toKeyExclusive: effectiveToKeyExclusive,
        limit,
        now: nowForPolicy,
        excludeBookingId: exclusion?.bookingId,
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
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/public/providers/[providerId]/slots failed", {
        requestId,
        route: "GET /api/public/providers/{providerId}/slots",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
