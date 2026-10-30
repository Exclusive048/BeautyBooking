import { z } from "zod";
import { toAppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { personalMasterProviderWhere } from "@/lib/master/access";
import {
  loadMasterSetupGuide,
  loadStudioSetupGuide,
  resolveSetupGuideStudio,
  updateSetupGuide,
} from "@/lib/onboarding/setup-guide";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";

/**
 * SETUP-GUIDE-01 — «Первые шаги» СВОЕГО кабинета (мастера или студии).
 *
 *   GET   ?scope=master|studio — шаги и что уже сделано. Его читает подсказка
 *         на экране шага: шаг отмечается сам, пока человек работает на экране.
 *   PATCH { scope, action } — `confirmRules` (правила записи просмотрены),
 *         `hide` (скрыть карточку на главной) / `show` (вернуть — из профиля).
 *
 * Студия — та, что открыта в кабинете, и только для владельца или
 * администратора (`resolveSetupGuideStudio`).
 */

type Scope = "master" | "studio";

const patchSchema = z.object({
  scope: z.enum(["master", "studio"]),
  action: z.enum(["confirmRules", "hide", "show"]),
});

async function resolveProviderId(userId: string, scope: Scope): Promise<string | null> {
  if (scope === "studio") return (await resolveSetupGuideStudio(userId))?.providerId ?? null;
  const provider = await prisma.provider.findFirst({ where: personalMasterProviderWhere(userId), select: { id: true } });
  return provider?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const scope: Scope = new URL(req.url).searchParams.get("scope") === "studio" ? "studio" : "master";
    const guide =
      scope === "studio"
        ? await (async () => {
            const studio = await resolveSetupGuideStudio(auth.user.id);
            return studio ? loadStudioSetupGuide({ studioProviderId: studio.providerId, studioId: studio.studioId }) : null;
          })()
        : await loadMasterSetupGuide(auth.user.id);
    if (!guide) return fail("Кабинет не найден.", 404, "PROVIDER_NOT_FOUND");
    return ok({ guide });
  } catch (error) {
    return setupGuideFailure(req, error, "GET");
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const body = await parseBody(req, patchSchema);
    const providerId = await resolveProviderId(auth.user.id, body.scope);
    if (!providerId) return fail("Кабинет не найден.", 404, "PROVIDER_NOT_FOUND");

    await updateSetupGuide(providerId, body.action);
    return ok({ ok: true });
  } catch (error) {
    return setupGuideFailure(req, error, "PATCH");
  }
}

/**
 * ERROR-ENVELOPE-NEW-ROUTES: `parseBody` БРОСАЕТ `AppError` (400 / 413 / 422) —
 * без перехвата отказ валидации становился HTML-страницей 500 Next. Теперь 4xx
 * уходит своим кодом и текстом, сбой БД — конвертом 500 со строкой `logError`.
 */
function setupGuideFailure(req: Request, error: unknown, method: "GET" | "PATCH"): Response {
  const appError = toAppError(error);
  if (appError.status >= 500) {
    logError(`${method} /api/me/setup-guide failed`, {
      requestId: getRequestId(req),
      route: `${method} /api/me/setup-guide`,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
  return fail(appError.message, appError.status, appError.code);
}
