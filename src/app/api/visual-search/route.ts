import { NextResponse } from "next/server";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rateLimit/rateLimiter";
import { visualSearchImageSchema } from "@/lib/visual-search/schemas";
import { searchByImage } from "@/lib/visual-search/searcher";
import { fileTypeFromBuffer } from "file-type";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT = { limit: 10, windowSeconds: 60 };

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return null;
}

function softFail(reason: "unrecognized" | "low_confidence" | "not_enough_indexed") {
  const message =
    reason === "unrecognized"
      ? "Не удалось определить тип услуги. Попробуйте другое фото."
      : reason === "low_confidence"
        ? "Фото не распознано с достаточной уверенностью. Попробуйте более чёткое фото."
        : "Пока мало работ в этой категории — попробуйте позже.";
  return NextResponse.json(
    { ok: false, error: { message, details: { reason } } },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const ip = extractClientIp(req) ?? "unknown";
    const allowed = await checkRateLimit(
      `rate:visualSearch:${ip}`,
      RATE_LIMIT.limit,
      RATE_LIMIT.windowSeconds
    );
    if (!allowed) {
      return jsonFail(429, "Too many requests", "RATE_LIMITED");
    }

    const formData = await req.formData();
    const parsed = visualSearchImageSchema.safeParse({ image: formData.get("image") });
    if (!parsed.success) {
      return jsonFail(400, "Image is required", "MEDIA_FILE_REQUIRED");
    }

    const fileValue = parsed.data.image;
    if (fileValue.size <= 0 || fileValue.size > MAX_IMAGE_SIZE_BYTES) {
      return jsonFail(400, "File is too large", "MEDIA_FILE_TOO_LARGE");
    }

    const buffer = Buffer.from(await fileValue.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)) {
      return jsonFail(415, "Unsupported image type", "MEDIA_INVALID_MIME");
    }

    const result = await searchByImage(new Uint8Array(buffer));
    if (!result.ok) {
      return softFail(result.reason);
    }

    return jsonOk({ results: result.results, category: result.category });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/visual-search failed", {
        requestId: getRequestId(req),
        route: "POST /api/visual-search",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
