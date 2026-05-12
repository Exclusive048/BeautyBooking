import type { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/access";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { listConversations } from "@/lib/chat/conversation-aggregator";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * GET /api/chat/conversations — list per-pair conversations for the
 * caller. Perspective derives from `?as=master|client` (defaults to
 * "master" when the caller has the MASTER role, otherwise "client").
 */
export async function GET(req: NextRequest) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;

    const url = new URL(req.url);
    const asParam = url.searchParams.get("as");

    const isMaster = user.roles.includes(AccountType.MASTER);
    const perspective: "MASTER" | "CLIENT" =
      asParam === "client"
        ? "CLIENT"
        : asParam === "master"
          ? "MASTER"
          : isMaster
            ? "MASTER"
            : "CLIENT";

    if (perspective === "MASTER" && !isMaster) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const conversations = await listConversations({
      userId: user.userId,
      perspective,
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
