import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { getMasterReviewsView, loadReviewServiceTitles } from "@/lib/master/reviews-view.service";
import { paginateByOffset, readOffsetCursor } from "@/lib/pagination/offset-cursor";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/master/reviews";

const querySchema = z.object({
  filter: z.enum(["all", "unanswered", "good", "bad"]).default("all"),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * MOBILE-MASTER-C — отзывы мастера (`/cabinet/master/reviews`,
 * `getMasterReviewsView`) постранично: последние 100 отзывов всех рабочих
 * профилей (как на вебе), сводка (`stats`) и счётчики фильтров — по всем ста,
 * `total` — после фильтра. Отзыв о визите в студию входит в рейтинг, но
 * отвечает на него студия (`canReply: false`).
 *
 * Ответ / правка ответа / подсказка / жалоба — существующие
 * `POST|PATCH /api/reviews/{id}/reply`, `POST /api/reviews/{id}/suggest-reply`,
 * `POST /api/reviews/{id}/report` с `id` отсюда (публичный токен).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const offset = readOffsetCursor(query.cursor);
    const workProfiles = await getMasterWorkProfiles(user.id);

    const view = await getMasterReviewsView({
      masterProviderId: workProfiles.personalId,
      workProfileIds: workProfiles.allIds,
      currentUserId: user.id,
      currentUserRoles: user.roles,
      filter: query.filter,
    });
    const page = paginateByOffset(view.reviews, offset, query.limit);
    const serviceTitles = await loadReviewServiceTitles(page.items.map((review) => review.bookingId));

    return ok(
      {
        filter: view.activeFilter,
        stats: view.stats,
        filterCounts: view.filterCounts,
        items: page.items.map((review) => ({
          id: review.id,
          bookingId: review.bookingId ?? null,
          rating: review.rating,
          text: review.text,
          authorName: review.authorName,
          createdAt: review.createdAt,
          serviceTitle: review.bookingId ? serviceTitles.get(review.bookingId) ?? null : null,
          replyText: review.replyText,
          repliedAt: review.repliedAt,
          reportedAt: review.reportedAt,
          isNew: review.isNew,
          isStudioVisit: review.targetType === "studio",
          canReply: review.targetType === "provider",
          publicTags: review.publicTags,
          privateTags: review.privateTags ?? [],
        })),
        nextCursor: page.nextCursor,
        total: page.total,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить отзывы. Попробуйте ещё раз.",
    });
  }
}
