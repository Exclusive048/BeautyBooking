import type { RateLimitResult } from "@/lib/rate-limit";

/**
 * FIX-C11 · GUEST-BOOKING-OUTAGE-CODE-ASYMMETRY — отказ лимитера называет
 * ПРИЧИНУ, а не только факт.
 *
 * ## Что было
 *
 * Четыре пишущих гостевых пути записи (`/api/bookings` и три `/api/public/*`)
 * отказывали ПРАВИЛЬНО — инв. #6 fail-closed, замерено FIX-C10 с нулевой дельтой
 * строк, — но отвечали `429 RATE_LIMITED`: гостю, делающему **первый** запрос,
 * продукт сообщал, что запросов слишком много. Причина техническая, не
 * смысловая: все четыре звали legacy-перегрузку `checkRateLimit(key, limit,
 * window)`, которая возвращает `boolean` и причину выразить не может.
 *
 * FIX-B12 уже построил честного двойника (`reason: "unavailable"` → 503
 * `RATE_LIMIT_UNAVAILABLE`) на перегрузке с `RateLimitConfig`, поэтому здесь
 * применяется существующий механизм, а не изобретается новый.
 *
 * 🔴 **Политика НЕ меняется**: и то, и другое — отказ, роут по-прежнему не
 * пишет ничего. Меняется только то, что читает человек, и то, что клиент
 * решает делать дальше: 429 — «реже», 503 — «повторите».
 *
 * ⚠️ Legacy-перегрузка сознательно НЕ переписывается: у неё есть сайты, для
 * которых boolean достаточен (`log-error`, `support/*`, telegram-вебхук —
 * вызывающий там бот со своими ретраями). Переписать её значило бы менять все
 * сайты разом ради четырёх; вместо этого четыре переведены на перегрузку с
 * конфигом, у которой причина уже есть.
 */

export type RateLimitRefusal = {
  status: 429 | 503;
  message: string;
  code: "RATE_LIMITED" | "RATE_LIMIT_UNAVAILABLE";
  retryAfterSeconds: number;
};

/**
 * `null` — лимит пройден, отказывать не нужно.
 *
 * Возвращает описание отказа, а не готовый `Response`: сайты отвечают разными
 * конвертами (`jsonFail` в роутах, `AppError` внутри `createBooking`), и
 * навязать один из них здесь значило бы переписать форму ответа заодно с кодом.
 */
export function resolveRateLimitRefusal(...results: RateLimitResult[]): RateLimitRefusal | null {
  const limited = results.filter(
    (result): result is Extract<RateLimitResult, { limited: true }> => result.limited
  );
  if (limited.length === 0) return null;

  // Недоступность важнее исчерпанного бюджета: если хотя бы одну ось посчитать не
  // удалось, «слишком много запросов» — утверждение, которого мы не проверяли.
  const unavailable = limited.find((result) => result.reason === "unavailable");
  const retryAfterSeconds = Math.max(...limited.map((result) => result.retryAfterSeconds));

  if (unavailable) {
    return {
      status: 503,
      message: "Сервис временно недоступен. Попробуйте позже.",
      code: "RATE_LIMIT_UNAVAILABLE",
      retryAfterSeconds,
    };
  }

  return {
    status: 429,
    message: "Слишком много запросов. Попробуйте позже.",
    code: "RATE_LIMITED",
    retryAfterSeconds,
  };
}
