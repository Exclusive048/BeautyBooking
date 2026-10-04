import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { listMyChatBlocks } from "@/lib/chat/blocks";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * MOBILE-POLISH (App Store 1.2) — «Заблокированные»: кого вы заблокировали в
 * переписке, свежие первыми. Элемент — `{ id, createdAt, name, avatarUrl }`:
 * имя и фото, под которыми вы знаете собеседника (у мастера — его кабинет),
 * без телефона и внутренних id. Снять блок — `DELETE /api/me/blocks/{id}`.
 */
export async function GET(req: Request) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const items = await listMyChatBlocks(user.userId);
    return jsonOk({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/me/blocks failed", {
        requestId: getRequestId(req),
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return jsonFail(500, "Не удалось загрузить список. Попробуйте ещё раз.", "INTERNAL_ERROR");
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
