import { AppError, toAppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { getRequestId, logError } from "@/lib/logging/logger";
import { scrubRecord } from "@/lib/observability/scrub";

/**
 * SECURITY-EXPOSURE-AUDIT-01 · Y9 — OAuth callback error responses must NOT
 * carry `AppError.details`.
 *
 * The VK / Yandex provider libraries attach the raw upstream OAuth response as
 * `details` (see `src/lib/{vk,yandex}/oauth.ts`). On a partial-token response
 * (`access_token` present, `refresh_token` missing → "incomplete") or a
 * profile-error response, that blob can contain a **real access_token /
 * refresh_token / id_token or the user's profile data**. The callbacks' outer
 * catch previously did `fail(msg, status, code, appError.details)`, sending it
 * straight to the browser.
 *
 * This helper is the single place all three callbacks (auth/vk, auth/yandex,
 * integrations/vk) route their catch through: it logs a **scrubbed** view for
 * server-side diagnostics (tokens/PII redacted by `scrubRecord`) and returns
 * only the curated message + code — never the raw payload.
 */
export function failOAuthCallback(req: Request, error: unknown) {
  const appError = error instanceof AppError ? error : toAppError(error);
  logError("OAuth callback failed", {
    requestId: getRequestId(req),
    code: appError.code,
    status: appError.status,
    details:
      appError.details && typeof appError.details === "object"
        ? scrubRecord(appError.details as Record<string, unknown>)
        : undefined,
  });
  return fail(appError.message, appError.status, appError.code);
}
