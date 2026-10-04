import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { paginateByOffset, readOffsetCursor } from "@/lib/pagination/offset-cursor";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { parseQuery } from "@/lib/validation";
import { loadStudioReviewsSet } from "@/features/studio-cabinet/reviews/server/reviews-data.service";
import { loadStudioReviewsStats } from "@/features/studio-cabinet/reviews/server/reviews-stats.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/reviews";

const querySchema = z.object({
  filter: z.enum(["all", "no_reply", "low_rating", "five_star"]).default("all"),
  /** Provider мастера студии; `all` — без фильтра. */
  master: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * MOBILE-STUDIO-C (G7) — отзывы студии (`/cabinet/studio/reviews`)
 * постранично: статистика и счётчики фильтров — по всем отзывам студии,
 * `total` — после `filter`/`master`. `canReply` — по правилу ответа на
 * отзыв (отзыв на студию или на мастера этой студии), `isReported` — жалоба
 * уже отправлена. Ответ, правка ответа, подсказка и жалоба —
 * `/api/reviews/{id}/reply|suggest-reply|report`.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const offset = readOffsetCursor(query.cursor);
    const access = await requireStudioCabinetAdmin(user.id);

    const master = query.master && query.master !== "all" ? query.master : null;
    const [set, stats] = await Promise.all([
      loadStudioReviewsSet({
        studioId: access.studioId,
        currentUserId: user.id,
        filter: query.filter,
        masterId: master ?? undefined,
      }),
      loadStudioReviewsStats(access.studioId),
    ]);
    const page = paginateByOffset(set.items, offset, query.limit);

    return ok(
      {
        filter: query.filter,
        master,
        stats,
        filterCounts: set.filterCounts,
        unansweredCount: set.unansweredCount,
        totalReviewsCount: set.totalReviewsCount,
        masterOptions: set.masterOptions,
        // Подпись даты («3 дня назад») — забота клиента: в ответе только `createdAt` (UTC).
        items: page.items.map((item) => ({
          id: item.id,
          clientName: item.clientName,
          rating: item.rating,
          createdAt: item.createdAt,
          master: item.master,
          serviceName: item.serviceName,
          text: item.text,
          reply: item.reply,
          canReply: item.canReply,
          isReported: item.isReported,
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
