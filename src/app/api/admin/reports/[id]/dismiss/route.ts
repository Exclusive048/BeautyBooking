import { handleContentReportDecision } from "@/features/admin-cabinet/reports/server/decision-route";

export const runtime = "nodejs";

/**
 * MOBILE-POLISH (App Store 1.2) — «Отклонить» жалобу на контент: нарушения
 * нет. Тело `{ note? }` (до 1000 символов). Только из NEW; разобранная —
 * 409 CONFLICT. Автор жалобы после этого может пожаловаться снова.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleContentReportDecision(req, ctx.params, "DISMISSED");
}
