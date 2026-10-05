import { fail } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * MOBILE-MASTER-C — общая обвязка JSON-чтений кабинета мастера
 * (`/api/cabinet/master/{dashboard,bookings,schedule/week,clients,reviews}`).
 *
 * Ответы личные — `private, no-store`: ни браузер, ни прокси не кэшируют
 * кабинет (и прокси может приложить к ответу обновлённую сессионную куку).
 * Лимит — общий тир прокси `publicApi` по аккаунту, как у прочих GET кабинетов.
 */
export const CABINET_NO_STORE_INIT: ResponseInit = { headers: { "Cache-Control": "private, no-store" } };

/** 4xx — как есть (текст сервера уже на русском); 5xx — лог и текст по канону. */
export function cabinetReadFailure(
  req: Request,
  error: unknown,
  input: { route: string; message: string },
): Response {
  const appError = toAppError(error);
  if (appError.status < 500) {
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
  logError(`${input.route} failed`, {
    requestId: getRequestId(req),
    route: input.route,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return fail(input.message, 500, "INTERNAL_ERROR");
}
