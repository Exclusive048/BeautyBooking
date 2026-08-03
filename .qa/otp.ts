// QA harness — deterministic OTP recovery + rate-limit reset.
//
// The OtpCode table stores only `codeHash` = HMAC-SHA256(OTP_HMAC_SECRET,
// `${phone}:${code}`) — never the plaintext. SMS is not wired in dev, and
// the dev-server log (which does print the code) is the user's own stdout
// that the harness cannot tail. So we recover the plaintext deterministically
// by brute-forcing the 6-digit space (100000..999999, ~900k HMAC ops, <2s)
// against the latest unused codeHash for the phone. Self-contained, no log
// stream, no new runtime dependency.

import { execFileSync } from "node:child_process";
import { createHmac, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Container names drift (compose adds a `-1` suffix: `beautyhub-redis` ->
// `beautyhub-redis-1`), which silently broke every `docker exec` in PASS-01.
// Discover the running container by name-pattern so it can't drift again; an
// explicit env var still wins, and a hard default is the last resort.
function discoverContainer(pattern: RegExp, fallback: string): string {
  try {
    const out = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      encoding: "utf8",
    });
    const names = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return names.find((n) => pattern.test(n)) ?? fallback;
  } catch {
    return fallback;
  }
}

const PG_CONTAINER =
  process.env.QA_PG_CONTAINER ?? discoverContainer(/masterryadom-db|postgres/i, "masterryadom-db");
const REDIS_CONTAINER =
  process.env.QA_REDIS_CONTAINER ?? discoverContainer(/redis/i, "beautyhub-redis-1");

type EnvMap = Record<string, string>;

function parseEnvFile(file: string): EnvMap {
  const out: EnvMap = {};
  if (!existsSync(file)) return out;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv(): EnvMap {
  const root = process.cwd();
  const base = parseEnvFile(path.join(root, ".env"));
  const local = parseEnvFile(path.join(root, ".env.local"));
  return { ...base, ...local };
}

const env = loadEnv();

function dbCredentials(): { user: string; db: string } {
  const url = env.DATABASE_URL ?? "";
  const match = url.match(/^postgres(?:ql)?:\/\/([^:]+):[^@]*@[^/]+\/([^?]+)/);
  if (match) {
    return { user: match[1], db: match[2] };
  }
  return { user: "master", db: "masterryadom" };
}

function psql(sql: string): string {
  const { user, db } = dbCredentials();
  const stdout = execFileSync(
    "docker",
    ["exec", PG_CONTAINER, "psql", "-U", user, "-d", db, "-tA", "-c", sql],
    { encoding: "utf8" },
  );
  return stdout.trim();
}

function hashOtp(phone: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function latestUnusedCodeHash(phone: string): string | null {
  const safePhone = phone.replace(/'/g, "''");
  const sql = `SELECT "codeHash" FROM "OtpCode" WHERE phone = '${safePhone}' AND "usedAt" IS NULL AND "expiresAt" > now() ORDER BY "createdAt" DESC LIMIT 1;`;
  const value = psql(sql);
  return value.length > 0 ? value : null;
}

/**
 * Recovers the plaintext OTP for `phone` by brute-forcing the latest unused
 * codeHash. Retries the DB read briefly in case the request just landed.
 */
export async function recoverOtp(phone: string): Promise<string> {
  const secret = env.OTP_HMAC_SECRET;
  if (!secret) {
    throw new Error("OTP_HMAC_SECRET not found in .env / .env.local");
  }

  let target: string | null = null;
  for (let attempt = 0; attempt < 10 && !target; attempt += 1) {
    target = latestUnusedCodeHash(phone);
    if (!target) await new Promise((r) => setTimeout(r, 250));
  }
  if (!target) {
    throw new Error(`No unused OtpCode row found for ${phone}`);
  }

  for (let code = 100000; code <= 999999; code += 1) {
    const candidate = String(code);
    if (hashOtp(phone, candidate, secret) === target) {
      return candidate;
    }
  }
  throw new Error(`Could not recover OTP for ${phone} (no 6-digit match)`);
}

/**
 * Сбрасывает ключи OTP-рейт-лимита в Redis. Зеркалит `src/lib/auth/otp-rate-limit.ts`.
 *
 * ⚠️ GATES-FIX-01 — здесь были ДВА бага, из-за которых сброс работал наполовину:
 *
 * 1. **verify-ключи строились без IP-компоненты.** Продукт использует
 *    `verifyScopeId(identity, ip)` = `sha256(phone) + ":" + sha256(ip)`, а
 *    харнесс удалял `otp:verify:lock:sha256(phone)` — ключ, которого не
 *    существует. То есть lock/fail-счётчики не чистились вообще, просто это
 *    редко всплывало (истекали по TTL).
 * 2. **Вызов был один на весь прогон.** `OTP_REQUEST_IP_LIMIT = 5/60s`, а
 *    ролей девять — с шестой роли прогон гарантированно ловил 429. Ровно этот
 *    симптом и был зафайлен (роли billing-*), и он же убил спеку в RKN-FIX-10.
 *    Лечится вызовом ПЕРЕД КАЖДЫМ логином (см. `.qa/smoke.spec.ts`).
 *
 * Это харнесс-домен: продуктовые лимиты не трогаются, dev-only обхода в
 * `src/` не появляется. Мы лишь возвращаем окно в исходное состояние между
 * независимыми логинами — как если бы они шли от разных людей в разное время.
 */
export function clearOtpRateLimit(phones: string[], ip = "unknown"): void {
  const keys = new Set<string>();
  const ipHash = sha256(ip);
  // Счётчик запросов по IP. На localhost XFF нет → extractClientIp вернёт null
  // → продукт хеширует строку "unknown".
  keys.add(`otp:request:ip:${ipHash}`);
  for (const phone of phones) {
    const h = sha256(phone);
    keys.add(`otp:request:phone:${h}`);
    // verifyScopeId = `${sha256(identity)}:${sha256(ip)}` — обе половины.
    keys.add(`otp:verify:lock:${h}:${ipHash}`);
    keys.add(`otp:verify:fail:${h}:${ipHash}`);
  }
  try {
    execFileSync(
      "docker",
      ["exec", REDIS_CONTAINER, "redis-cli", "DEL", ...Array.from(keys)],
      { encoding: "utf8" },
    );
  } catch {
    // Non-fatal: if Redis is unreachable the run may still pass while the
    // window has headroom. The smoke surfaces any resulting 429 anyway.
  }
}
