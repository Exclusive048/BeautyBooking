import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { getSessionContext } from "@/lib/auth/session";
import { revokeSessionFamily } from "@/lib/auth/session-families";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

/**
 * MOBILE-AUTH-A3 — завершить одну сессию (семью) из списка `GET /api/me/sessions`.
 *
 * Отзываются все строки семьи: её refresh больше не обновится, а access-токены
 * перестают проходить сразу (`loadActiveSessionUser`, SEC-13) — и Bearer, и
 * кука. Можно завершить и текущую — это выход на этом устройстве.
 * Идемпотентно: уже завершённая своя сессия — тот же `200 {}`. Чужая или
 * несуществующая — `404 SESSION_NOT_FOUND`, без различия «чья».
 */

// Ключ семьи — UUID (SEC-13) или id legacy-строки (cuid).
const familyIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

const NOT_FOUND_MESSAGE = "Не удалось найти сессию. Обновите список.";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRequestContext(req, async () => {
    const session = await getSessionContext();
    if (!session) {
      return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
    }

    const parsed = familyIdSchema.safeParse((await ctx.params).id);
    if (!parsed.success) {
      return fail(NOT_FOUND_MESSAGE, 404, "SESSION_NOT_FOUND");
    }

    const revoked = await revokeSessionFamily(session.user.id, parsed.data);
    if (!revoked) {
      return fail(NOT_FOUND_MESSAGE, 404, "SESSION_NOT_FOUND");
    }

    void recordSurfaceEvent({
      surface: "auth",
      outcome: "success",
      operation: parsed.data === session.familyId ? "session-revoke-current" : "session-revoke",
    });
    return ok({}, { headers: { "Cache-Control": "no-store" } });
  });
}
