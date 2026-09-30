import { NextResponse } from "next/server";
import { jsonFail } from "@/lib/api/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { verifyChatAttachmentToken } from "@/lib/media/private-delivery";
import { getMediaFile } from "@/lib/media/service";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import * as UI_TEXT from "@/lib/ui/text";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export const runtime = "nodejs";

/**
 * MASTER-CHAT-ATTACHMENT-FIX-A — opaque chat-attachment delivery route.
 *
 * The path carries ONLY a signed token — no asset cuid leaks into the
 * URL bar (per user requirement «никаких ID в запросе»). The token's
 * payload encodes:
 *   - `aid` — the MediaAsset.id we resolve to bytes
 *   - `exp` — 15-minute expiry (chat threads stay open longer than
 *     generic media-read; refreshing the thread re-issues tokens)
 *   - `purpose: "chat-attachment-read"` — distinct from generic media
 *     tokens so cross-purpose replay is impossible
 *
 * Auth flow:
 *   1. Decode + verify token signature/expiry. Bad → 401.
 *   2. Resolve assetId out of the token.
 *   3. Hand off to `getMediaFile(user, assetId)` which runs the
 *      `ensureCanReadMedia` ACL — for `CHAT_MESSAGE` entityType this
 *      checks that the current user is one of the two chat participants
 *      (client or master). Studio admins / outsiders → 403.
 *
 * The token alone does NOT grant access — the session user is still
 * required + must match the chat participants. Token expiry exists so
 * a stale share-link can't be used after a long delay.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const token = params.token?.trim();
    if (!token) {
      return jsonFail(400, "Ссылка на файл не открылась. Откройте вложение из чата ещё раз.", "VALIDATION_ERROR");
    }

    const verified = verifyChatAttachmentToken(token);
    if (!verified) {
      void recordSurfaceEvent({
        surface: "media",
        outcome: "denied",
        operation: "chat-attachment-token",
        code: "INVALID_CHAT_ATTACHMENT_TOKEN",
      });
      // FIX-C3 · item 3: строка была НЕВЕРНА для самого частого случая. Токен
      // вложения живёт 15 минут (`CHAT_ATTACHMENT_TOKEN_TTL_SECONDS`), поэтому
      // на открытой дольше вкладке чата картинки перестают грузиться у
      // пользователя, который **уже вошёл** — а ответ советовал ему войти. Это
      // тот же класс, что F3: сервер называет причиной не то.
      //
      // Статус остаётся 401 (доступа по этому токену нет), меняется смысл:
      // причина названа честно, и она действенна — обновить страницу, чтобы
      // получить свежие токены.
      return jsonFail(401, UI_TEXT.chat.composer.attachmentLinkExpired, "UNAUTHORIZED");
    }

    const user = await getSessionUser();
    // getMediaFile invokes ensureCanReadMedia which — for CHAT_MESSAGE
    // entityType — admits only the two chat participants (client +
    // master). Studio admins, outsiders → 403. See
    // `src/lib/media/access.ts:canReadChatAttachmentMedia`.
    const file = await getMediaFile(user, verified.assetId);

    void recordSurfaceEvent({
      surface: "media",
      outcome: "success",
      operation: "chat-attachment-stream",
    });
    return new NextResponse(file.stream, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.contentLength),
        // Private — never cached by shared caches. The token's 15-min
        // expiry makes browser-cache acceptable.
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/chat/attachment/[token] failed", {
        requestId,
        route: "GET /api/chat/attachment/{token}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    if (appError.status === 401 || appError.status === 403) {
      void recordSurfaceEvent({
        surface: "media",
        outcome: "denied",
        operation: "chat-attachment-read",
        code: appError.code,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
