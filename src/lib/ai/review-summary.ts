import { del, get, set } from "@/lib/cache/cache";
import { withSingleFlight } from "@/lib/cache/single-flight";
import { logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { aiChat } from "@/lib/ai/client";
import { assertAiFeaturesEnabled } from "@/lib/ai/config";
import { AI_PROMPTS } from "@/lib/ai/prompts";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

const CACHE_KEY_PREFIX = "ai:review-summary:";
const CACHE_TTL_SECONDS = 86_400;
const MIN_REVIEWS_FOR_SUMMARY = 3;
const MAX_REVIEWS_FOR_PROMPT = 30;
/**
 * 29.09 доработки · 30, шаг 0: один платный вызов на промах кэша. Вызов ИИ —
 * до 15 с и один повтор (`ai/client.ts`), поэтому замок живёт дольше худшего
 * случая, а проигравший ждёт победителя дольше стандартных 300 мс — иначе он
 * не дождётся и позовёт ИИ сам. Redis недоступен — считаем без замка (FIX-C11).
 */
const GENERATION_LOCK_TTL_SECONDS = 45;
const GENERATION_WAIT_MS = 35_000;
const GENERATION_POLL_MS = 250;

function cacheKey(providerId: string): string {
  return `${CACHE_KEY_PREFIX}${providerId}`;
}

export async function getReviewSummary(providerId: string): Promise<{
  summary: string | null;
  reviewsCount: number;
}> {
  await assertAiFeaturesEnabled();

  const reviewsCount = await prisma.review.count({
    where: {
      targetType: "provider",
      targetId: providerId,
      text: { not: null },
      ...ACTIVE_REVIEW_FILTER,
    },
  });

  if (reviewsCount < MIN_REVIEWS_FOR_SUMMARY) {
    return { summary: null, reviewsCount };
  }

  const cached = await get<string>(cacheKey(providerId));
  if (typeof cached === "string") {
    return { summary: cached, reviewsCount };
  }

  const { summary } = await withSingleFlight<{ summary: string | null }>({
    lockKey: `sf:${cacheKey(providerId)}`,
    read: async () => {
      const value = await get<string>(cacheKey(providerId));
      return typeof value === "string" ? { summary: value } : null;
    },
    compute: async () => ({ summary: await generateSummary(providerId) }),
    lockTtlSeconds: GENERATION_LOCK_TTL_SECONDS,
    waitMs: GENERATION_WAIT_MS,
    pollIntervalMs: GENERATION_POLL_MS,
  });
  return { summary, reviewsCount };
}

/** Генерация и запись в кэш; `null` — сводки нет (мало текстов или ИИ не ответил). */
async function generateSummary(providerId: string): Promise<string | null> {
  const reviews = await prisma.review.findMany({
    where: {
      targetType: "provider",
      targetId: providerId,
      text: { not: null },
      ...ACTIVE_REVIEW_FILTER,
    },
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

  if (reviewsForPrompt.length < MIN_REVIEWS_FOR_SUMMARY) return null;

  const prompt = AI_PROMPTS.reviewSummary;
  const result = await aiChat({
    scope: "review-summary",
    systemPrompt: prompt.system,
    userPrompt: prompt.buildUserPrompt(reviewsForPrompt),
    temperature: 0.5,
    maxTokens: 300,
  });

  if (!result) return null;

  await set(cacheKey(providerId), result, CACHE_TTL_SECONDS);
  logInfo("Review summary generated", { providerId, reviewsUsed: reviewsForPrompt.length });
  return result;
}

export async function invalidateReviewSummaryCache(providerId: string): Promise<void> {
  await del(cacheKey(providerId));
}
