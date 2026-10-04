import "server-only";

import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import { parseBody } from "@/lib/validation";
import {
  decideContentReport,
  type ContentReportDecision,
} from "@/features/admin-cabinet/reports/server/reports.service";
import { CONTENT_REPORT_COMMENT_MAX } from "@/lib/moderation/content-reports";

const NOTE_TOO_LONG = `Пометка — не длиннее ${CONTENT_REPORT_COMMENT_MAX} символов.`;

const resolveBodySchema = z.object({
  note: z
    .string({ error: "Опишите, какие меры приняты." })
    .trim()
    .min(1, "Опишите, какие меры приняты.")
    .max(CONTENT_REPORT_COMMENT_MAX, NOTE_TOO_LONG),
});

const dismissBodySchema = z.object({
  note: z.string().trim().max(CONTENT_REPORT_COMMENT_MAX, NOTE_TOO_LONG).optional(),
});

const reportIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** «Отклонить» без пометки можно прислать и вовсе без тела. */
async function parseOptionalBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const text = await req.clone().text();
  if (!text.trim()) return schema.parse({});
  return parseBody(req, schema);
}

/**
 * MOBILE-POLISH — общий обработчик `POST /api/admin/reports/{id}/resolve` и
 * `…/dismiss`: администратор, тело, решение одной транзакцией с журналом
 * действий (`AdminAuditLog`: CONTENT_REPORT_RESOLVED / _DISMISSED).
 */
export async function handleContentReportDecision(
  req: Request,
  params: Promise<{ id: string }>,
  decision: ContentReportDecision,
) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const route =
    decision === "RESOLVED" ? "POST /api/admin/reports/{id}/resolve" : "POST /api/admin/reports/{id}/dismiss";
  try {
    const parsedId = reportIdSchema.safeParse((await params).id);
    if (!parsedId.success) return fail("Жалоба не найдена.", 404, "NOT_FOUND");

    const note =
      decision === "RESOLVED"
        ? (await parseBody(req, resolveBodySchema)).note
        : ((await parseOptionalBody(req, dismissBodySchema)).note ?? "") || null;

    const result = await decideContentReport({
      reportId: parsedId.data,
      adminUserId: auth.user.id,
      decision,
      note,
      context: getAdminAuditContext(req),
    });
    return ok({ report: result });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code, appError.details);
    }
    logError(`${route} failed`, {
      route,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail("Не удалось сохранить решение по жалобе. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
