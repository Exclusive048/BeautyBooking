import { handleContentReportDecision } from "@/features/admin-cabinet/reports/server/decision-route";

export const runtime = "nodejs";

/**
 * MOBILE-POLISH (App Store 1.2) — «Принять меры» по жалобе на контент.
 * Тело `{ note }` (обязательно, до 1000 символов: что сделано). Сам контент
 * удаляется в его разделе («Отзывы», «Пользователи») — здесь фиксируется
 * решение. Только из NEW; разобранная — 409 CONFLICT.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleContentReportDecision(req, ctx.params, "RESOLVED");
}
