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

type RouteParams = Promise<{ slug: string }>;

const bodySchema = z
  .object({
    // CHAT-FOUNDATION-A-MIGRATION: body OR attachment required.
    // `sendConversationMessage` enforces the same invariant; this
    // refine just surfaces the friendlier message at parse time.
    body: z.string().trim().max(1000).optional().default(""),
    attachmentMediaAssetId: z.string().trim().min(1).nullable().optional(),
  })
  .refine(
    (value) => (value.body && value.body.length > 0) || Boolean(value.attachmentMediaAssetId),
    { message: "Сообщение пустое.", path: ["body"] },
  );

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
    const slug = decodeURIComponent(params.slug);

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
      slug,
      perspective,
      userId: user.userId,
      body: body.body,
      attachmentMediaAssetId: body.attachmentMediaAssetId ?? null,
    });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/chat/threads/[slug]/messages failed", {
        requestId,
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
