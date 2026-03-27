import { del, get, set } from "@/lib/cache/cache";
import { logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { aiChat } from "@/lib/ai/client";
import { assertAiFeaturesEnabled } from "@/lib/ai/config";
import { AI_PROMPTS } from "@/lib/ai/prompts";

const CACHE_KEY_PREFIX = "ai:review-summary:";
const CACHE_TTL_SECONDS = 86_400;
const MIN_REVIEWS_FOR_SUMMARY = 3;
const MAX_REVIEWS_FOR_PROMPT = 30;

function cacheKey(providerId: string): string {
  return `${CACHE_KEY_PREFIX}${providerId}`;
}

export async function getReviewSummary(providerId: string): Promise<{
  summary: string | null;
  reviewsCount: number;
}> {
  await assertAiFeaturesEnabled();

  const reviewsCount = await prisma.review.count({
    where: { targetType: "provider", targetId: providerId, text: { not: null } },
  });

  if (reviewsCount < MIN_REVIEWS_FOR_SUMMARY) {
    return { summary: null, reviewsCount };
  }

  const cached = await get<string>(cacheKey(providerId));
  if (typeof cached === "string") {
    return { summary: cached, reviewsCount };
  }

  const reviews = await prisma.review.findMany({
    where: { targetType: "provider", targetId: providerId, text: { not: null } },
    orderBy: { createdAt: "desc" },
    take: MAX_REVIEWS_FOR_PROMPT,
    select: { rating: true, text: true, createdAt: true },
  });

  const reviewsForPrompt = reviews
    .filter((r): r is typeof r & { text: string } => typeof r.text === "string" && r.text.trim().length > 0)
    .map((r) => ({
      rating: r.rating,
      text: r.text,
      date: r.createdAt.toISOString().slice(0, 10),
    }));

  if (reviewsForPrompt.length < MIN_REVIEWS_FOR_SUMMARY) {
    return { summary: null, reviewsCount };
  }

  const prompt = AI_PROMPTS.reviewSummary;
  const result = await aiChat({
    scope: "review-summary",
    systemPrompt: prompt.system,
    userPrompt: prompt.buildUserPrompt(reviewsForPrompt),
    temperature: 0.5,
    maxTokens: 300,
  });

  if (!result) {
    return { summary: null, reviewsCount };
  }

  await set(cacheKey(providerId), result, CACHE_TTL_SECONDS);
  logInfo("Review summary generated", { providerId, reviewsUsed: reviewsForPrompt.length });

  return { summary: result, reviewsCount };
}

export async function invalidateReviewSummaryCache(providerId: string): Promise<void> {
  await del(cacheKey(providerId));
}
