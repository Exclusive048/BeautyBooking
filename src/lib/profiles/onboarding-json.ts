import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { isBearerAuthorization } from "@/lib/auth/bearer";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { logError } from "@/lib/logging/logger";
import { createMasterProfile, createStudioProfile } from "@/lib/profiles/professional";

/**
 * MOBILE-B1 — «Стать мастером / открыть студию» для клиента, которому редирект
 * бесполезен (нативное приложение).
 *
 * Веб шлёт сюда голую HTML-форму (`<form method="post">`, полей нет) и живёт
 * на 303: успех — в кабинет, без сессии — на `/login`. Приложению это вредит
 * дважды: dio идёт по 303 как по GET и получает 200 с HTML кабинета, а
 * протухший токен выглядит как 200 с HTML `/login` — то есть цикл «401 →
 * refresh → повтор» не запускается никогда.
 *
 * Поэтому `Authorization: Bearer` или `Accept: application/json` получают
 * обычный конверт `ok()`/`fail()`; веб-форма (её `Accept` — `text/html…`, без
 * Bearer) идёт прежней веткой байт в байт.
 *
 * Перевыпуск токенов НЕ нужен: claim `roles` в access-токене ни одна проверка
 * не читает — роли и кабинеты решаются по БД (`loadActiveSessionUser`,
 * `MasterProfile`/`StudioMembership`), и `addRoleToUser` сбрасывает кэш
 * `/api/me`. Старый Bearer-токен сразу проходит в новый кабинет; актуальные
 * роли приложение берёт из `GET /api/me`.
 */
export function wantsJsonResponse(req: Request): boolean {
  if (isBearerAuthorization(req.headers.get("authorization"))) return true;
  return /(^|[\s,])application\/json(\s*(;|,|$))/i.test(req.headers.get("accept") ?? "");
}

export type ProfessionalOnboardingRole = "MASTER" | "STUDIO";

export type ProfessionalOnboardingData =
  | {
      role: "MASTER";
      /** `created` — кабинет создан этим запросом; `already-exists` — уже был (повтор безопасен). */
      status: "created" | "already-exists";
      providerId: string;
      masterProfileId: string;
      /** Куда ведёт веб — подсказка, у приложения своя навигация. */
      next: "/cabinet/master";
    }
  | {
      role: "STUDIO";
      status: "created" | "already-exists";
      providerId: string;
      studioId: string;
      next: "/cabinet/studio";
    };

async function onboard(user: SessionUser, role: ProfessionalOnboardingRole): Promise<ProfessionalOnboardingData> {
  if (role === "MASTER") {
    // Тот же режим, что у веб-ветки: пробный тариф догоняет фоном, ответ не ждёт.
    const result = await createMasterProfile({
      userId: user.id,
      roles: user.roles,
      ensureFreeSubscriptionMode: "background",
    });
    return {
      role,
      status: result.status,
      providerId: result.providerId,
      masterProfileId: result.masterProfileId,
      next: "/cabinet/master",
    };
  }
  const result = await createStudioProfile({ userId: user.id, roles: user.roles });
  return {
    role,
    status: result.status,
    providerId: result.providerId,
    studioId: result.studioId,
    next: "/cabinet/studio",
  };
}

/**
 * JSON-ветка `POST /api/onboarding/professional/{master,studio}`. Тело не
 * читается (веб-форма полей не шлёт). 401 `UNAUTHORIZED` — без сессии; прочие
 * сбои — конверт с кодом из `toAppError` (500 `INTERNAL_ERROR`).
 */
export async function respondProfessionalOnboardingJson(
  role: ProfessionalOnboardingRole,
  route: string,
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
    return ok(await onboard(user, role));
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError(`${route} failed`, {
        route,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
