import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";
import { logError } from "@/lib/logging/logger";
import { parseBody } from "@/lib/validation";
import {
  clearVkCommunityToken,
  getVkCommunityAdminView,
  saveVkCommunityToken,
} from "@/lib/vk/community";

/**
 * VK-COMMUNITY-NOTIFY-01 — ключ доступа сообщества ВКонтакте для уведомлений.
 * Решение владельца: без новой переменной окружения — ключ вводится здесь,
 * сообщество берётся из `NEXT_PUBLIC_VK_COMMUNITY_URL`. Ключ сервер не
 * отдаёт ни в одном ответе: GET/PUT/DELETE возвращают только состояние.
 */

const saveSchema = z.object({
  // Ключ сообщества VK — ~85 символов; границы с запасом, но без мусора.
  token: z.string().trim().min(20).max(512),
});

function respondError(error: unknown, op: string) {
  const view = toAuthSurfaceError(error);
  if (view.status >= 500) {
    logError("admin.vk-community failed", {
      op,
      code: view.code,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return fail(view.message, view.status, view.code);
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    return ok(await getVkCommunityAdminView());
  } catch (error) {
    return respondError(error, "get");
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await parseBody(req, saveSchema);
    const view = await saveVkCommunityToken({
      token: body.token,
      adminUserId: auth.user.id,
      context: getAdminAuditContext(req),
    });
    return ok(view);
  } catch (error) {
    return respondError(error, "put");
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const view = await clearVkCommunityToken({
      adminUserId: auth.user.id,
      context: getAdminAuditContext(req),
    });
    return ok(view);
  } catch (error) {
    return respondError(error, "delete");
  }
}
