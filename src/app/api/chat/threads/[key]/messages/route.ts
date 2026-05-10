import type { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/access";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { parseBody } from "@/lib/validation";
import { sendConversationMessage } from "@/lib/chat/message-sender";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteParams = Promise<{ key: string }>;

const bodySchema = z.object({
  body: z.string().trim().min(1, "Сообщение пустое.").max(1000),
});

const RATE_LIMIT = { limit: 30, windowSeconds: 60 };

export async function POST(
  req: NextRequest,
  ctx: { params: RouteParams },
) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const params = await ctx.params;
    const rawKey = decodeURIComponent(params.key);

    const url = new URL(req.url);
    const asParam = url.searchParams.get("as");
    const isMaster = user.roles.includes(AccountType.MASTER);
    const perspective =
      asParam === "client" ? "CLIENT" : asParam === "master" ? "MASTER" : isMaster ? "MASTER" : "CLIENT";

    const allowed = await checkRateLimit(
      `rate:chatSend:${user.userId}`,
      RATE_LIMIT.limit,
      RATE_LIMIT.windowSeconds,
    );
    if (!allowed) {
      return jsonFail(429, "Слишком много сообщений. Подождите немного.", "RATE_LIMITED");
    }

    const body = await parseBody(req, bodySchema);

    const result = await sendConversationMessage({
      rawKey,
      perspective,
      userId: user.userId,
      body: body.body,
    });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/chat/threads/[key]/messages failed", {
        requestId,
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
