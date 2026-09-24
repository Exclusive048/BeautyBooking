import { ok, fail } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/access";
import { requireProviderOwner } from "@/lib/auth/ownership";
import { prisma } from "@/lib/prisma";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { listBookableSlots } from "@/lib/schedule/bookable-window";
import { resolveRescheduleExclusion } from "@/lib/schedule/reschedule-exclusion";
import { resolveStudioMoveSlots } from "@/lib/studio/move-plan";
import { toAppError } from "@/lib/api/errors";
import { stricterBookingWindow } from "@/lib/bookings/policy-enforcement";
import { getRequestId, logError } from "@/lib/logging/logger";

// EXP-025: `minBookingHoursAhead` is required so the shared bookable-window
// primitive can drop too-soon slots — the cutoff this endpoint previously
// skipped (vs `/slots`).
const PROVIDER_SELECT = {
  id: true,
  timezone: true,
  minBookingHoursAhead: true,
  maxBookingDaysAhead: true,
} as const;

/**
 * SEC-05 — расписание неопубликованного кабинета видно только своей стороне.
 *
 * Роут обслуживает две аудитории: анонимный виджет записи в студию и
 * кабинетное окно переноса брони. Поэтому «просто добавить `isPublished`»
 * нельзя — мастер, снявший профиль с публикации, обязан продолжать переносить
 * уже существующие брони. Публикация проверяется для всех, а владелец кабинета
 * и админ студии получают доступ по той же проверке прав, что и остальные
 * provider-действия (`requireProviderOwner`), без собственной копии правила.
 */
async function loadProviderForOwnSide(req: Request, providerKey: string) {
  let user;
  try {
    user = await getSessionUser(req);
  } catch {
    return null;
  }

  const provider = await resolveProviderBySlugOrId({
    key: providerKey,
    select: PROVIDER_SELECT,
  });
  if (!provider) return null;

  try {
    await requireProviderOwner(user, provider.id);
  } catch {
    return null;
  }
  return provider;
}

/**
 * STUDIO-PAUSE-SPLIT-01 — мастер, АКТИВНЫЙ в опубликованной студии, отдаёт
 * окошки виджету студии, даже если скрыл свою личную страницу: `isPublished`
 * теперь только личная видимость, а работа в студии — `studioPaused`. Раньше
 * это было одно поле, поэтому публичного резолва хватало.
 */
async function loadStudioActiveMaster(providerKey: string) {
  const master = await resolveProviderBySlugOrId({
    key: providerKey,
    select: { ...PROVIDER_SELECT, type: true, studioId: true, ownerUserId: true, studioPaused: true },
  });
  if (!master || master.type !== "MASTER" || !master.studioId || !isStudioMasterActive(master)) {
    return null;
  }
  const studio = await prisma.provider.findUnique({
    where: { id: master.studioId },
    select: { isPublished: true },
  });
  if (!studio?.isPublished) return null;
  return {
    id: master.id,
    timezone: master.timezone,
    minBookingHoursAhead: master.minBookingHoursAhead,
    maxBookingDaysAhead: master.maxBookingDaysAhead,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const p = params instanceof Promise ? await params : params;
    const url = new URL(req.url);
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const fromKey = url.searchParams.get("from") ?? "";
    const toKey = url.searchParams.get("to") ?? "";
    const limitRaw = url.searchParams.get("limit");

    if (!serviceId) return fail("Укажите услугу.", 400, "SERVICE_REQUIRED");
    if (!isDateKey(fromKey)) return fail("Проверьте дату начала.", 400, "DATE_INVALID");
    if (toKey && !isDateKey(toKey)) return fail("Проверьте дату окончания.", 400, "DATE_INVALID");

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    if (limitRaw && !Number.isFinite(limit)) {
      return fail("Слишком длинный список. Сузьте поиск.", 400, "LIMIT_INVALID");
    }

    // MANUAL-BOOKING-SLOTS-01: `?manual=1` — окно ручной записи (без
    // `minBookingHoursAhead`, см. `operatorWindow`). Действует только для своей
    // стороны кабинета; чужой запрос с флагом получает обычное клиентское окно.
    const operatorProvider =
      url.searchParams.get("manual") === "1" ? await loadProviderForOwnSide(req, p.id) : null;

    // SEC-05: сначала — публичный резолв с обязательной публикацией (тот же
    // примитив, что у соседнего `/slots`). Неопубликованный кабинет доступен
    // только своей стороне.
    const provider =
      operatorProvider ??
      (await resolveProviderBySlugOrId({
        key: p.id,
        select: PROVIDER_SELECT,
        requirePublished: true,
      })) ??
      (await loadStudioActiveMaster(p.id)) ??
      (await loadProviderForOwnSide(req, p.id));
    if (!provider) return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");

    const duration = await resolveServiceDuration(provider.id, serviceId);
    if (!duration.ok) return fail(duration.message, duration.status, duration.code);

    // EXP-026: align `to` to the inclusive contract `/slots` documents
    // (callers today never send `to`; this just stops the two endpoints
    // disagreeing on the off-by-one). Convert inclusive `to` → exclusive.
    const toKeyExclusive = toKey ? addDaysToDateKey(toKey, 1) : undefined;

    // RESCHEDULE-SELF-SLOT: окно переносимой брони не занято — только для
    // сторон этой брони (см. reschedule-exclusion.ts). MOVE-PICKER-DURATION:
    // окошки переноса — по длине самой записи, как её проверит перенос.
    const exclusion = await resolveRescheduleExclusion(
      req,
      provider.id,
      url.searchParams.get("excludeBookingId"),
    );
    // MOVE-PICKER-DURATION: студийный перенос — окошки ровно той длины, которую
    // проверит `moveStudioBooking` (в том числе к ДРУГОМУ мастеру и для записи
    // из нескольких услуг): общий `planStudioMoveDuration`.
    const studioMove = await resolveStudioMoveSlots(req, provider.id, url.searchParams.get("moveBookingId"));
    const windowMinutes =
      studioMove?.durationMin ??
      (exclusion && exclusion.durationMin > 0 ? exclusion.durationMin : duration.data);

    // EXP-025: same primitive as `/slots` → min-ahead + schedule filter
    // applied identically. A slot returned here is one `assertBookingWindow`
    // will accept at submit.
    // BOOKING-WINDOW-SPLIT: окно записи — владельца услуги (у услуги студии —
    // студии), ровно то, что проверит `resolveBookingCore` и перенос.
    const serviceOwner = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        provider: { select: { minBookingHoursAhead: true, maxBookingDaysAhead: true } },
      },
    });

    const bookable = await listBookableSlots({
      provider,
      serviceId,
      durationMinutes: windowMinutes,
      fromKey,
      toKeyExclusive,
      limit,
      now: new Date(),
      excludeBookingId: studioMove ? studioMove.excludeBookingId : exclusion?.bookingId,
      operatorWindow: operatorProvider !== null,
      // BOOKING-WINDOW-STRICTER: более строгое из окон владельца услуги и мастера.
      windowPolicy: serviceOwner?.provider
        ? stricterBookingWindow(serviceOwner.provider, provider)
        : undefined,
    });
    if (!bookable.ok) return fail(bookable.message, bookable.status, bookable.code);

    return ok({ slots: bookable.slots, meta: bookable.meta });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/masters/[id]/availability failed", {
        requestId,
        route: "GET /api/masters/{id}/availability",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
