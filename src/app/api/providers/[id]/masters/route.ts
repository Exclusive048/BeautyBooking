import { ok, fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { toAppError } from "@/lib/api/errors";
import { logError } from "@/lib/logging/logger";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { listPublicTeamMasters } from "@/lib/providers/team-masters";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Команда провайдера для виджета записи студии в браузере. Тело — сервис
 * `listPublicTeamMasters` (29.09 доработки · 13): SSR страницы студии зовёт его
 * напрямую, без HTTP-запроса к себе.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const parsed = providerIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    return ok({ masters: await listPublicTeamMasters(parsed.data.id) });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code);
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    logError("GET /api/providers/[id]/masters failed", { error: detail });
    return fail("Не удалось загрузить мастеров. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
