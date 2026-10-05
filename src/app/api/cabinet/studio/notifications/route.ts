import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { encodeOffsetCursor, readOffsetCursor } from "@/lib/pagination/offset-cursor";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { parseQuery } from "@/lib/validation";
import { loadStudioNotificationFeed } from "@/features/studio-cabinet/notifications/server/notifications-feed.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/notifications";

const querySchema = z.object({
  chip: z
    .enum(["all", "unread", "bookings", "cancellations", "reschedules", "reviews", "messages", "team", "finance", "system"])
    .default("all"),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * MOBILE-STUDIO-C (ops) — уведомления студии (`/cabinet/studio/notifications`):
 * канал STUDIO центра уведомлений и ожидающие заявки на смену графика, по
 * вкладкам веба, постранично, с путями экранов приложения. Личные
 * уведомления и уведомления мастера сюда не входят. Только владелец /
 * администратор студии.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const query = parseQuery(new URL(req.url), querySchema);
    const offset = readOffsetCursor(query.cursor);

    const feed = await loadStudioNotificationFeed({
      userId: user.id,
      studioId: access.studioId,
      chip: query.chip,
      offset,
      limit: query.limit,
    });
    const next = offset + feed.items.length;

    return ok(
      {
        timezone: access.timezone,
        chip: feed.chip,
        unreadCount: feed.unreadCount,
        needsDecisionCount: feed.needsDecisionCount,
        chipCounts: feed.chipCounts,
        items: feed.items,
        nextCursor: feed.items.length > 0 && next < feed.total ? encodeOffsetCursor(next) : null,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить уведомления. Попробуйте ещё раз.",
    });
  }
}
