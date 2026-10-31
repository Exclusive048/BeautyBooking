import type { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/access";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { listConversations } from "@/lib/chat/conversation-aggregator";
import { resolveChatPerspective } from "@/lib/chat/perspective";
import { resolveStudioChatProviderId } from "@/lib/chat/studio-side";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * GET /api/chat/conversations — list per-pair conversations for the
 * caller. Perspective derives from `?as=master|client|studio` (defaults to
 * "master" when the caller has the MASTER role, otherwise "client").
 * STUDIO-CHAT: `studio` — переписки студии кабинета (владелец и
 * администраторы, `resolveStudioChatProviderId`).
 */
export async function GET(req: NextRequest) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;

    const url = new URL(req.url);
    const perspective = resolveChatPerspective(url.searchParams.get("as"), user.roles);

    if (perspective === "MASTER" && !user.roles.includes(AccountType.MASTER)) {
      return jsonFail(403, "Недостаточно прав для этого действия.", "FORBIDDEN");
    }
    const studioProviderId =
      perspective === "STUDIO" ? await resolveStudioChatProviderId(user.userId) : null;

    const conversations = await listConversations({
      userId: user.userId,
      perspective,
      studioProviderId,
    });
    return jsonOk({ conversations, perspective });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/chat/conversations failed", {
        requestId,
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
