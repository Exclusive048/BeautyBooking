import { prisma } from "@/lib/prisma";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { requireBookingCancelAccess } from "@/lib/auth/ownership";
import { parseBody } from "@/lib/validation";
import { bookingCancelSchema } from "@/lib/validation/bookings";
import { cancelSoloPackageBooking } from "@/lib/bookings/package-booking";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  loadBookingWithRelations,
  notifyCancelledByClient,
  notifyCancelledByMaster,
  notifyProviderSideCancelled,
} from "@/lib/notifications/booking-notifications";

/**
 * PACKAGE-BOOKING-MVP-1 — cancel a whole package atomically.
 * `[id]` is the BookingPackage id. Access is checked via the cancel-access
 * rule on the package's first child (same provider/client as the group).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const p = params instanceof Promise ? await params : params;

    const pkg = await prisma.bookingPackage.findUnique({
      where: { id: p.id },
      select: { id: true, bookings: { select: { id: true }, take: 1, orderBy: { startAtUtc: "asc" } } },
    });
    if (!pkg) throw new AppError("Пакет не найден.", 404, "PACKAGE_NOT_FOUND");
    const firstChild = pkg.bookings[0];
    if (!firstChild) throw new AppError("Пакет не найден.", 404, "PACKAGE_NOT_FOUND");

    // Reuse the single-booking cancel-access rule on a child → resolves the
    // acting side (CLIENT vs PROVIDER) with the same ownership checks.
    const access = await requireBookingCancelAccess(user, firstChild.id);

    const parsed = await parseBody(req, bookingCancelSchema);

    const result = await cancelSoloPackageBooking({
      bookingPackageId: pkg.id,
      cancelledBy: access.cancelledBy,
      reason: parsed.reason ?? null,
    });

    // PACKAGE-CANCEL-UI-01: отмена пакета не уведомляла никого — ни мастера
    // при отмене клиентом, ни клиента при отмене мастером. Одно уведомление на
    // пакет (по первой отменённой услуге), как и у создания пакета.
    const firstCancelledId = result.cancelledBookingIds[0];
    if (firstCancelledId) {
      try {
        const fullBooking = await loadBookingWithRelations(firstCancelledId);
        if (fullBooking) {
          if (access.cancelledBy === "CLIENT") {
            await notifyCancelledByClient(fullBooking);
          } else {
            await notifyCancelledByMaster(fullBooking, { actorUserId: userId });
            // NOTIFY-STUDIO-ADMIN-BOOKING-ACTIONS: в студийном пакете у
            // компонентов бывают разные мастера — каждый узнаёт о своём;
            // администраторы получают одно уведомление на пакет.
            const notified = new Set<string>();
            const seenMasters = new Set<string>();
            for (const bookingId of result.cancelledBookingIds) {
              const component =
                bookingId === fullBooking.id ? fullBooking : await loadBookingWithRelations(bookingId);
              if (!component) continue;
              const masterKey = component.masterProviderId ?? component.providerId;
              if (seenMasters.has(masterKey)) continue;
              seenMasters.add(masterKey);
              const sent = await notifyProviderSideCancelled(component, {
                actorUserId: user.userId,
                kind: "CANCELLED",
                excludeUserIds: notified,
              });
              sent.forEach((id) => notified.add(id));
            }
          }
        }
      } catch (error) {
        logError("POST /api/bookings/package/[id]/cancel notification failed", {
          requestId: getRequestId(req),
          route: "POST /api/bookings/package/{id}/cancel",
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/bookings/package/[id]/cancel failed", {
        requestId,
        route: "POST /api/bookings/package/{id}/cancel",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
