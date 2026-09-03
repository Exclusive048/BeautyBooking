import { ok, fail } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/access";
import { requireProviderOwner } from "@/lib/auth/ownership";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { listBookableSlots } from "@/lib/schedule/bookable-window";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

// EXP-025: `minBookingHoursAhead` is required so the shared bookable-window
// primitive can drop too-soon slots — the cutoff this endpoint previously
// skipped (vs `/slots`).
const PROVIDER_SELECT = { id: true, timezone: true, minBookingHoursAhead: true } as const;

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

    // SEC-05: сначала — публичный резолв с обязательной публикацией (тот же
    // примитив, что у соседнего `/slots`). Неопубликованный кабинет доступен
    // только своей стороне.
    const provider =
      (await resolveProviderBySlugOrId({
        key: p.id,
        select: PROVIDER_SELECT,
        requirePublished: true,
      })) ?? (await loadProviderForOwnSide(req, p.id));
    if (!provider) return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");

    const duration = await resolveServiceDuration(provider.id, serviceId);
    if (!duration.ok) return fail(duration.message, duration.status, duration.code);

    // EXP-026: align `to` to the inclusive contract `/slots` documents
    // (callers today never send `to`; this just stops the two endpoints
    // disagreeing on the off-by-one). Convert inclusive `to` → exclusive.
    const toKeyExclusive = toKey ? addDaysToDateKey(toKey, 1) : undefined;

    // EXP-025: same primitive as `/slots` → min-ahead + schedule filter
    // applied identically. A slot returned here is one `assertBookingWindow`
    // will accept at submit.
    const bookable = await listBookableSlots({
      provider,
      serviceId,
      durationMinutes: duration.data,
      fromKey,
      toKeyExclusive,
      limit,
      now: new Date(),
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
