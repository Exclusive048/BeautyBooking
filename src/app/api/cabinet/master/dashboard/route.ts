import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getActionRequiredBookingCountsForMaster } from "@/lib/bookings/counts";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { loadMasterBookingItems } from "@/lib/master/booking-items.service";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { getMasterDashboardData } from "@/lib/master/dashboard.service";
import { encodePublicId } from "@/lib/public-id";
import { getUnansweredReviewsCountForMaster } from "@/lib/reviews/counts";
import { isScheduleEndingSoon } from "@/lib/schedule/calendar-shared";
import { loadSchedulePlan } from "@/lib/schedule/patterns";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/master/dashboard";

/**
 * MOBILE-MASTER-C — экран «Сегодня» приложения мастера: то же, что главная
 * кабинета (`/cabinet/master/dashboard`, `getMasterDashboardData`), в JSON.
 *
 * Записи дня — сутки САЛОНА (rule 17): элементы единой формы
 * (`booking-items.service.ts`) с пометками `isCurrent` / `isNext` от сервиса
 * дашборда. «Требуют внимания» — три ближайшие записи, ждущие ответа, и два
 * отзыва без ответа (как на вебе) плюс счётчики: записи — тем же условием, что
 * бейдж кабинета, с разбивкой «подтвердить / перенос»; отзывы — как бейдж
 * «Отзывы». Свободные окошки по категориям и «Первые шаги» — отдельные
 * эндпоинты (`/api/cabinet/master/dashboard/free-slots`, `/api/me/setup-guide`).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const workProfiles = await getMasterWorkProfiles(user.id);
    const masterId = workProfiles.personalId;
    const now = new Date();

    const [data, schedulePlan, attentionCounts, unansweredReviewsCount] = await Promise.all([
      getMasterDashboardData({ masterId, workProfiles, now }),
      loadSchedulePlan(masterId, now),
      getActionRequiredBookingCountsForMaster(workProfiles.allIds),
      getUnansweredReviewsCountForMaster(masterId),
    ]);

    const todayIds = data.todayBookings.map((booking) => booking.id);
    const attentionIds = data.pendingBookings.map((booking) => booking.id);
    const items = await loadMasterBookingItems({
      ids: [...todayIds, ...attentionIds],
      workProfileIds: workProfiles.allIds,
      now,
    });
    const itemById = new Map(items.map((item) => [item.id, item]));
    const flagsById = new Map(
      data.todayBookings.map((booking) => [booking.id, { isCurrent: booking.isCurrent, isNext: booking.isNext }]),
    );

    const today = todayIds.flatMap((id) => {
      const item = itemById.get(id);
      const flags = flagsById.get(id);
      return item && flags ? [{ ...item, ...flags }] : [];
    });
    const attentionBookings = attentionIds.flatMap((id) => {
      const item = itemById.get(id);
      return item ? [item] : [];
    });

    return ok(
      {
        timezone: data.master.timezone,
        todayKey: toLocalDateKey(now, data.master.timezone),
        master: {
          id: data.master.id,
          name: data.master.name,
          avatarUrl: data.master.avatarUrl,
          publicUsername: data.master.publicUsername,
          studio: data.master.studio,
        },
        isSolo: data.isSolo,
        showWorkContext: data.showWorkContext,
        scheduleEndsOn: isScheduleEndingSoon(schedulePlan) ? schedulePlan.configuredUntil : null,
        kpis: data.kpis,
        freeSlot: data.freeSlot
          ? {
              startAtUtc: data.freeSlot.startAtUtc.toISOString(),
              endAtUtc: data.freeSlot.endAtUtc.toISOString(),
              durationMin: data.freeSlot.durationMin,
            }
          : null,
        attention: {
          bookingsCount: attentionCounts.total,
          pendingConfirmationCount: attentionCounts.pendingConfirmation,
          rescheduleRequestsCount: attentionCounts.rescheduleRequests,
          unansweredReviewsCount,
          bookings: attentionBookings,
          reviews: data.unansweredReviews.map((review) => ({
            id: encodePublicId(review.id),
            authorName: review.authorName,
            rating: review.rating,
            text: review.text,
            createdAt: review.createdAt.toISOString(),
          })),
        },
        today,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить главную. Попробуйте ещё раз.",
    });
  }
}
