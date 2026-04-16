import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import type {
  VisualSearchFailureReason,
  VisualSearchHttpResponse,
} from "@/lib/visual-search/contracts";
import { searchByImage } from "@/lib/visual-search/searcher";
import { getVisualSearchEnabled } from "@/lib/visual-search/config";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const VISUAL_SEARCH_RATE_LIMIT = {
  windowSeconds: 60,
  maxRequests: 10,
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

    const result = await searchByImage(new Uint8Array(imageBuffer));
    if (!result.ok) {
      return jsonOk<VisualSearchHttpResponse>({
        ...result,
        message: mapReasonToMessage(result.reason),
      });
    }

    return jsonOk<VisualSearchHttpResponse>(result);
  } catch (error) {
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
