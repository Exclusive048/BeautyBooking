import "server-only";

import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { OAUTH_LOGIN_PROVIDERS, type OAuthLoginProvider } from "@/lib/auth/oauth-providers";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

/**
 * MOBILE-AUTH-A2 — одноразовые значения мобильного OAuth в Redis.
 *
 *  · **код входа** (`mobile:oauth:code:<sha256>`, 60 с) — колбэк провайдера
 *    кладёт `{ userId, codeChallenge, provider }` и уводит браузер в приложение
 *    с кодом; приложение меняет код + PKCE-verifier на токены
 *    (`POST /api/mobile/v1/auth/oauth/exchange`);
 *  · **link-intent** (`mobile:oauth:intent:<sha256>`, 5 мин) — уже вошедшее
 *    приложение просит привязать VK/Яндекс к СВОЕМУ аккаунту; intent несёт
 *    `{ userId, provider }` через системный браузер, где сессии приложения нет.
 *
 * Оба одноразовые АТОМАРНО: забираются `GETDEL` (Redis ≥ 6.2, в проде
 * `redis:7-alpine`), то есть два параллельных обмена одного кода не могут оба
 * его увидеть, а предъявленный код сгорает при любом исходе проверки.
 *
 * В ключе — sha256 значения, не само значение: ключи видны в мониторинге и
 * `SCAN`, а код/intent — предъявительские.
 *
 * Без Redis флоу невозможен (код выдаёт один контейнер, меняет другой), поэтому
 * отказ Redis — `AppError` 503, а не память процесса: fail-closed, как прочие
 * чувствительные пути (CLAUDE.md, rule 10). `REDIS_URL` в проде обязателен
 * (`env.ts`).
 */

export const MOBILE_OAUTH_CODE_TTL_SECONDS = 60;
export const MOBILE_OAUTH_INTENT_TTL_SECONDS = 5 * 60;

const CODE_KEY_PREFIX = "mobile:oauth:code:";
const INTENT_KEY_PREFIX = "mobile:oauth:intent:";

/** 32 байта → 43 символа base64url: и код, и intent. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const codeRecordSchema = z.object({
  userId: z.string().min(1),
  codeChallenge: z.string().min(1),
  provider: z.enum(OAUTH_LOGIN_PROVIDERS),
});

const intentRecordSchema = z.object({
  userId: z.string().min(1),
  provider: z.enum(OAUTH_LOGIN_PROVIDERS),
});

export type MobileOAuthCodeRecord = z.infer<typeof codeRecordSchema>;
export type MobileOAuthIntentRecord = z.infer<typeof intentRecordSchema>;

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function keyFor(prefix: string, token: string): string {
  return `${prefix}${createHash("sha256").update(token).digest("hex")}`;
}

async function requireRedis() {
  const client = await getRedisConnection();
  if (!client) {
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 503, "SERVICE_UNAVAILABLE");
  }
  return client;
}

async function storeOnce(prefix: string, record: object, ttlSeconds: number, operation: string): Promise<string> {
  const client = await requireRedis();
  const token = newToken();
  const stored = await withRedisCommandTimeout(
    operation,
    client.set(keyFor(prefix, token), JSON.stringify(record), { EX: ttlSeconds, NX: true }),
  );
  // NX: совпадение 256-битного значения с живым ключом — не случай, а дефект.
  if (stored !== "OK") {
    throw new AppError("Не удалось завершить вход. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
  return token;
}

async function takeOnce<T>(
  prefix: string,
  token: string,
  schema: z.ZodType<T>,
  operation: string,
): Promise<T | null> {
  // Чужая форма в Redis не ходит: такого значения сервер не выдавал.
  if (!TOKEN_PATTERN.test(token)) return null;
  const client = await requireRedis();
  const raw = await withRedisCommandTimeout(operation, client.getDel(keyFor(prefix, token)));
  if (typeof raw !== "string") return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Колбэк: код входа под PKCE-челлендж приложения. */
export function issueMobileOAuthCode(record: MobileOAuthCodeRecord): Promise<string> {
  return storeOnce(CODE_KEY_PREFIX, record, MOBILE_OAUTH_CODE_TTL_SECONDS, "mobile-oauth:code:set");
}

/** Обмен: код сгорает при любом исходе; `null` — неизвестен, протух или уже использован. */
export function takeMobileOAuthCode(code: string): Promise<MobileOAuthCodeRecord | null> {
  return takeOnce(CODE_KEY_PREFIX, code, codeRecordSchema, "mobile-oauth:code:take");
}

export function issueMobileOAuthLinkIntent(record: { userId: string; provider: OAuthLoginProvider }): Promise<string> {
  return storeOnce(INTENT_KEY_PREFIX, record, MOBILE_OAUTH_INTENT_TTL_SECONDS, "mobile-oauth:intent:set");
}

/** Мобильный старт: intent сгорает при предъявлении, даже если флоу потом бросят. */
export function takeMobileOAuthLinkIntent(intent: string): Promise<MobileOAuthIntentRecord | null> {
  return takeOnce(INTENT_KEY_PREFIX, intent, intentRecordSchema, "mobile-oauth:intent:take");
}
