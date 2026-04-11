import { ok, fail } from "@/lib/api/response";
import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { getReviewSummary } from "@/lib/ai/review-summary";
import { getClientIp } from "@/lib/http/ip";
import { logError } from "@/lib/logging/logger";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await ctx.params;

  const enabled = await getAiFeaturesEnabled();
  if (!enabled) {
    return fail("AI features are disabled", 503, "SYSTEM_FEATURE_DISABLED");
  }

  const ip = getClientIp(req);
  const limit = await checkRateLimit(`rl:ai:review-summary:${ip}`, RATE_LIMITS.aiReviewSummary);
  if (limit.limited) {
    return fail("Too many requests", 429, "RATE_LIMITED");
  }

  const provider = await resolveProviderBySlugOrId({
    key: providerId,
    select: { id: true },
    requirePublished: true,
  });

  if (!provider) {
    return fail("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  try {
    const result = await getReviewSummary(provider.id);
    return ok(result);
  } catch (error) {
    logError("Review summary generation failed", {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Failed to generate review summary", 500, "INTERNAL_ERROR");
  }
}
