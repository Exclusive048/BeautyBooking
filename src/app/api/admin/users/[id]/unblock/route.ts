import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import { parseBody } from "@/lib/validation";
import { BLOCK_REASON_MAX_LENGTH, unblockUser } from "@/features/admin-cabinet/users/server/block.service";

export const runtime = "nodejs";

/**
 * USER-BLOCKING-01 — снять блокировку. Причина необязательна (уходит в аудит);
 * права — те же, что у блокировки (`block.service.ts`).
 */

const bodySchema = z.object({
  reason: z
    .string()
    .trim()
    .max(BLOCK_REASON_MAX_LENGTH, `Причина — не длиннее ${BLOCK_REASON_MAX_LENGTH} символов.`)
    .optional(),
});

const userIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const parsedId = userIdSchema.safeParse((await ctx.params).id);
    if (!parsedId.success) return fail("Пользователь не найден.", 404, "NOT_FOUND");
    const id = parsedId.data;
    // Кнопка «Разблокировать» шлёт пустое тело — причина необязательна.
    const text = await req.clone().text();
    const body = text.trim() ? await parseBody(req, bodySchema) : bodySchema.parse({});
    const state = await unblockUser({
      actor: { id: auth.user.id, roles: auth.user.roles },
      targetUserId: id,
      reason: body.reason ?? null,
      context: getAdminAuditContext(req),
    });
    return ok({ user: state });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("admin.users.unblock failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return fail("Не удалось разблокировать пользователя. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
