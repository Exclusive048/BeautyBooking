import { jsonFail, jsonOk, type ApiFieldErrors } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import {
  createContentReport,
  createContentReportSchema,
} from "@/lib/moderation/content-reports";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

/** 20 жалоб в час на пользователя — с запасом для живого человека, мало для флуда очереди. */
const RATE_LIMIT = { maxRequests: 20, windowSeconds: 3600 };

type ValidationIssue = { path: string; message: string };

function readIssues(details: unknown): ValidationIssue[] {
  if (typeof details !== "object" || details === null) return [];
  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.filter(
    (issue): issue is ValidationIssue =>
      typeof issue === "object" &&
      issue !== null &&
      typeof (issue as ValidationIssue).path === "string" &&
      typeof (issue as ValidationIssue).message === "string",
  );
}

/**
 * Отказ валидации — текстом первого поля («Выберите причину жалобы.»), а не
 * общим «Проверьте поля»: в форме жалобы полей мало, и человеку нужно знать,
 * какое именно. Рядом — `fieldErrors` `{ поле: текст }` и прежние `details.issues`.
 */
function validationFailure(message: string, details: unknown) {
  const issues = readIssues(details);
  const fieldErrors: ApiFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path.split(".")[0];
    if (field && field !== "input" && !(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return jsonFail(
    400,
    issues[0]?.message ?? message,
    "VALIDATION_ERROR",
    details,
    Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
  );
}

/**
 * MOBILE-POLISH (App Store 1.2) — жалоба на контент от любого вошедшего
 * пользователя: страница мастера или студии, отзыв, работа в портфолио,
 * переписка (или одно сообщение в ней), предложение для моделей.
 *
 * Тело: `{ targetType, targetId, messageId?, reason, comment? }` — цель
 * публичным идентификатором (см. `lib/moderation/content-reports.ts`).
 * Ответ: `201 { id, alreadyReported: false }` — новая жалоба;
 * `200 { id, alreadyReported: true }` — открытая жалоба на эту цель уже есть.
 * 404 — цели нет или она не видна; 400 `REPORT_OWN_CONTENT` — свой контент.
 * Путь чувствительный (`SENSITIVE_ROUTE_PREFIXES`): при обрыве Redis — 503.
 * Жалобы мастеров на отзывы о себе — по-прежнему `POST /api/reviews/{id}/report`.
 */
export async function POST(req: Request) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;

    const refusal = resolveRateLimitRefusal(
      await checkRateLimit(routeRateLimitKey(req, "user", user.userId), RATE_LIMIT),
    );
    if (refusal) {
      return jsonFail(refusal.status, refusal.message, refusal.code);
    }

    const body = await parseBody(req, createContentReportSchema);
    const result = await createContentReport({ ...body, reporterUserId: user.userId });

    if (!result.alreadyReported) {
      // Без ПДн и без текста жалобы: только тип цели и причина.
      logInfo("Content report created", {
        requestId: getRequestId(req),
        targetType: body.targetType,
        reason: body.reason,
      });
    }

    return jsonOk(result, { status: result.alreadyReported ? 200 : 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/reports failed", {
        requestId: getRequestId(req),
        userId,
        route: "POST /api/reports",
        stack: error instanceof Error ? error.stack : undefined,
      });
      return jsonFail(500, "Не удалось отправить жалобу. Попробуйте ещё раз.", "INTERNAL_ERROR");
    }
    if (appError.code === "VALIDATION_ERROR") {
      return validationFailure(appError.message, appError.details);
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
