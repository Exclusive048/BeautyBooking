import { z } from "zod";
import { ConsentType } from "@prisma/client";

import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { extractClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getActiveConsent, recordUserConsents, revokeConsent } from "@/lib/legal/consent";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { parseBody } from "@/lib/validation";

/**
 * RKN-FIX-18 — управление согласием на маркетинговые коммуникации.
 *
 * Только `MARKETING`. Отзыв согласия на обработку ПДн или на оферту — это по
 * существу требование прекратить обработку, то есть удаление аккаунта; такой
 * интент интерфейс маршрутизирует, а не исполняет (граница зашита в
 * `revokeConsent`, здесь она просто не достижима — цель захардкожена).
 *
 * Симметрия важна: и включение, и выключение идут через единственный writer
 * (инв. #37). Включение — это НЕ «оживить старую строку», а новое согласие с
 * актуальной версией документа и свежими IP/UA.
 */

export const runtime = "nodejs";

const bodySchema = z.object({ enabled: z.boolean() });

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const active = await getActiveConsent(user.id, ConsentType.MARKETING);
    return jsonOk({
      enabled: active !== null,
      documentVersion: active?.documentVersion ?? null,
      agreedAt: active?.agreedAt?.toISOString() ?? null,
      currentVersion: LEGAL_DOCUMENTS.MARKETING.version,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/me/consents/marketing failed", {
        requestId: getRequestId(req),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await parseBody(req, bodySchema);

    if (body.enabled) {
      // Новое согласие: новая строка, текущая версия документа, свежие IP/UA.
      // Если активная строка уже есть — writer идемпотентен и не напишет ничего.
      await recordUserConsents({
        userId: user.id,
        flags: { terms: false, pdProcessing: false, marketing: true },
        ipAddress: extractClientIp(req),
        userAgent: req.headers.get("user-agent"),
      });
    } else {
      // Отзыв: строка НЕ удаляется, проставляется revokedAt.
      await revokeConsent({ userId: user.id, consentType: ConsentType.MARKETING });
    }

    const active = await getActiveConsent(user.id, ConsentType.MARKETING);
    return jsonOk({
      enabled: active !== null,
      documentVersion: active?.documentVersion ?? null,
      agreedAt: active?.agreedAt?.toISOString() ?? null,
      currentVersion: LEGAL_DOCUMENTS.MARKETING.version,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/me/consents/marketing failed", {
        requestId: getRequestId(req),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
