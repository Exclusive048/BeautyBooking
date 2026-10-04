import { BookingStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { toStudioBookingListItem } from "@/features/studio-cabinet/bookings/server/booking-json";
import { listStudioBookings } from "@/features/studio-cabinet/bookings/server/bookings-list.service";
import { loadStudioDashboardData } from "@/features/studio-cabinet/dashboard/server/dashboard-data.service";
import { toStudioDashboardJson } from "@/features/studio-cabinet/dashboard/server/dashboard-json";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/dashboard";

/** Сколько записей «ждут ответа» показывает главная (остальные — в журнале). */
const AWAITING_LIMIT = 20;

/**
 * MOBILE-STUDIO-C (ops) — главная кабинета студии: данные веб-дашборда
 * (`loadStudioDashboardData`: сегодня, KPI за 30 дней, топ мастеров, «Требует
 * внимания», загрузка сегодня, популярные услуги, выручка по мастерам) числами
 * и без href веба, плюс ближайшие записи, ждущие ответа студии, с действиями
 * (тот же набор, что пункт `bookings-awaiting`: PENDING / CHANGE_REQUESTED,
 * начало впереди). Только владелец / администратор студии.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const now = new Date();
    const [data, awaiting] = await Promise.all([
      loadStudioDashboardData({ studioId: access.studioId }),
      listStudioBookings({
        studioId: access.studioId,
        filters: {
          range: "all",
          status: [BookingStatus.PENDING, BookingStatus.CHANGE_REQUESTED],
          startsAfter: now,
        },
        page: { offset: 0, limit: AWAITING_LIMIT },
        withRangeCounts: false,
      }),
    ]);

    return ok(
      toStudioDashboardJson({
        studioId: access.studioId,
        timezone: access.timezone,
        todayKey: toLocalDateKey(now, access.timezone),
        data,
        awaitingBookings: awaiting.items.map((row) => toStudioBookingListItem(row, now)),
      }),
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить главную студии. Попробуйте ещё раз.",
    });
  }
}
