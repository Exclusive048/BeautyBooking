import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

/**
 * MASTER-RESCHEDULE-FIX-A — lightweight booking-context endpoint for
 * the master-side reschedule modal.
 *
 * Returns just the four fields the modal needs to render a free-slots
 * picker:
 *   - `masterProviderId` — for the `/api/masters/{id}/availability` call
 *   - `serviceId`        — to scope the slot query to this service +
 *                           pick up its duration override
 *   - `durationMin`      — pre-computed so the client doesn't need to
 *                           re-resolve service+master override math
 *   - `status` (runtime) — surfaces CHANGE_REQUESTED so the modal can
 *                           render the «В ожидании» guard view instead
 *                           of letting the master open a fresh request
 *                           on top of a pending one (#5а bug fix)
 *
 * Auth: requires the session user to be the master who owns the
 * booking. We use `getCurrentMasterProviderId(user.id)` (same helper as
 * `/status`, `/cancel`, etc) and check that the booking's
 * `masterProviderId` matches. Returns 404 on no match — same 404
 * the kanban + schedule grid would surface for missing bookings.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");

    // STUDIO-MASTER-PROFILES (этап 4): запись любого рабочего профиля мастера.
    const { allIds } = await getMasterWorkProfiles(user.id);

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        OR: [{ masterProviderId: { in: allIds } }, { providerId: { in: allIds } }],
      },
      select: {
        id: true,
        status: true,
        startAtUtc: true,
        endAtUtc: true,
        serviceId: true,
        providerId: true,
        masterProviderId: true,
        actionRequiredBy: true,
        // TZ-DISPLAY-SALON-PARITY-01: the booking's provider tz so the modal
        // renders the current-time label + slot times in SALON-tz (not the
        // viewer's browser tz). Precedence mirrors `resolvedMasterId` below,
        // and matches the provider `/availability` loads for slot generation.
        provider: { select: { timezone: true } },
        masterProvider: { select: { timezone: true } },
        service: { select: { durationMin: true, baseDurationMin: true } },
      },
    });
    if (!booking) {
      return jsonFail(404, "Запись не найдена.", "BOOKING_NOT_FOUND");
    }

    // Prefer baseDurationMin (set by manual booking) → fall back to
    // service catalog durationMin. Same precedence the schedule view
    // uses in `master/schedule.service.ts`.
    const durationMin = Math.max(
      15,
      booking.service.baseDurationMin ?? booking.service.durationMin,
    );

    // The reschedule modal needs the resolved booking master provider id
    // (the actual master if studio booking) — `masterProviderId` for
    // studio bookings, otherwise the provider itself for solo masters.
    const resolvedMasterId = booking.masterProviderId ?? booking.providerId;
    const timezone = booking.masterProvider?.timezone ?? booking.provider.timezone;

    const runtimeStatus = resolveBookingRuntimeStatus({
      status: booking.status,
      startAtUtc: booking.startAtUtc,
      endAtUtc: booking.endAtUtc,
    });

    return jsonOk({
      masterProviderId: resolvedMasterId,
      serviceId: booking.serviceId,
      durationMin,
      timezone,
      status: runtimeStatus,
      // MASTER-BOOKING-UI-FIX-A: surfacing actionRequiredBy lets the
      // reschedule modal distinguish initiator vs awaited side for
      // CHANGE_REQUESTED bookings — the «В ожидании» guard already
      // renders for both, but future enhancements (e.g. «Отозвать
      // запрос» button for the initiator only) can use this.
      actionRequiredBy: booking.actionRequiredBy ?? null,
    });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/master/bookings/[id]/reschedule-context failed", {
        requestId,
        route: "GET /api/master/bookings/{id}/reschedule-context",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
