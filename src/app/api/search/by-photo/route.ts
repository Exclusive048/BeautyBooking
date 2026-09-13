import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import type {
  VisualSearchFailureReason,
  VisualSearchHttpResponse,
} from "@/lib/visual-search/contracts";
import { searchByImage } from "@/lib/visual-search/searcher";
import {
  getVisualSearchEnabled,
  getVisualSearchEnabledByEnv,
} from "@/lib/visual-search/config";
import {
  byPhotoImageHash,
  getCachedByPhotoResult,
  setCachedByPhotoResult,
} from "@/lib/visual-search/by-photo-guards";
import { AiSpendCeilingError } from "@/lib/ai/spend-ceiling";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
// SEC-04 (AUDIT-CAMPAIGN-02 п.7): 10/60с → 3/60с — запрос стоит 2 vision +
// 1 embedding, а загрузка файла руками не бывает чаще; дедуп-хиты в тир
// всё равно не упираются редко (лимит проверяется первым — дешёвый отказ
// раньше чтения тела).
const VISUAL_SEARCH_RATE_LIMIT = {
  windowSeconds: 60,
  maxRequests: 3,
};

const imagePayloadSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().min(1).max(MAX_IMAGE_SIZE_BYTES),
});

function mapReasonToMessage(reason: VisualSearchFailureReason): string {
  if (reason === "unrecognized") {
    return UI_TEXT.home.visualSearch.messages.unrecognized;
  }
  if (reason === "low_confidence") {
    return UI_TEXT.home.visualSearch.messages.lowConfidence;
  }
  return UI_TEXT.home.visualSearch.messages.notEnoughIndexed;
}

export async function POST(req: Request) {
  try {
    const rateLimit = await checkRateLimit(
      `rl:visual-search:by-photo:${getClientIp(req)}`,
      VISUAL_SEARCH_RATE_LIMIT
    );
    if (rateLimit.limited) {
      return tooManyRequests(
        rateLimit.retryAfterSeconds,
        UI_TEXT.home.visualSearch.messages.rateLimited
      );
    }

    const enabled = await getVisualSearchEnabled();
    if (!enabled) {
      // VISUAL-SEARCH-DIAG-01 — «выключено» имеет ДВЕ разные причины, и по 403
      // они неотличимы: либо не заданы `YANDEX_API_KEY`/`YANDEX_FOLDER_ID` (тогда
      // `envEnabled: false` — фича не сконфигурирована, ENV-SPLIT-01), либо
      // креды есть, а админ снял тумблер `visualSearchEnabled` в SystemConfig
      // (`envEnabled: true`). Это первое, что надо знать, разбираясь «почему
      // визуальный поиск не работает», и без записи это требовало доступа к
      // прод-окружению. Значение кэшируется на 30 с, поэтому лог не заливается.
      logInfo("Visual search unavailable", {
        scope: "visual-search:search",
        stage: "feature_disabled",
        envEnabled: getVisualSearchEnabledByEnv(),
        requestId: getRequestId(req),
      });
      return jsonFail(
        403,
        UI_TEXT.home.visualSearch.messages.disabled,
        "SYSTEM_FEATURE_DISABLED",
        { feature: "visualSearch" }
      );
    }

    const formData = await req.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return jsonFail(400, UI_TEXT.home.visualSearch.messages.fileRequired, "MEDIA_FILE_REQUIRED");
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const detected = await fileTypeFromBuffer(imageBuffer);
    const parsed = imagePayloadSchema.safeParse({
      mimeType: detected?.mime ?? image.type,
      sizeBytes: image.size,
    });
    if (!parsed.success) {
      return jsonFail(400, UI_TEXT.home.visualSearch.messages.invalidFile, "VALIDATION_ERROR");
    }

    // SEC-04 п.7, слой 2 — дедуп: тот же файл в течение суток отдаёт
    // кэшированный ответ, не тратя ни бюджет, ни платные вызовы.
    const imageHash = byPhotoImageHash(imageBuffer);
    const cached = await getCachedByPhotoResult(imageHash);
    if (cached) {
      return jsonOk<VisualSearchHttpResponse>(cached);
    }

    // FIX-B16: суточный ДЕНЕЖНЫЙ потолок сработает внутри `searchByImage` — он
    // живёт в чокпойнте провайдера, чтобы покрывать и путь индексации, у
    // которого запроса нет. Роут ловит его отдельно от общего `catch` только
    // ради `Retry-After`: форма отказа (честный 429 + курируемая строка вместо
    // 500) — ратифицированное поведение SEC-04, и её надо сохранить.
    const result = await searchByImage(new Uint8Array(imageBuffer));
    const response: VisualSearchHttpResponse = result.ok
      ? result
      : { ...result, message: mapReasonToMessage(result.reason) };
    await setCachedByPhotoResult(imageHash, response);
    return jsonOk<VisualSearchHttpResponse>(response);
  } catch (error) {
    if (error instanceof AiSpendCeilingError) {
      return tooManyRequests(
        error.retryAfterSeconds,
        UI_TEXT.home.visualSearch.messages.budgetExhausted
      );
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/search/by-photo failed", {
        requestId: getRequestId(req),
        route: "POST /api/search/by-photo",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
