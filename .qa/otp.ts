// QA harness — deterministic OTP recovery + rate-limit reset.
//
// The OtpCode table stores only `codeHash` = HMAC-SHA256(OTP_HMAC_SECRET,
// `${identity}:${code}`) — never the plaintext. SMS is not wired in dev, and
// the dev-server log (which does print the code) is the user's own stdout
// that the harness cannot tail. So we recover the plaintext deterministically
// by brute-forcing the 6-digit space (100000..999999, ~900k HMAC ops, <2s)
// against the latest unused codeHash for that identity. Self-contained, no log
// stream, no new runtime dependency.
//
// QA-HARNESS-EMAIL-01 — **email is a first-class identity here, not a variant.**
// The closed deploy runs email-only (`PHONE_AUTH_ENABLED` tri-state is OFF in
// production), so a harness that can only recover phone codes cannot log into
// the thing we are about to ship. QA-003 worked around it with a local copy
// inside a gitignored diagnostic spec; that copy is now folded in and deleted.
//
// The product hashes BOTH channels with the same helper (`hashOtpCode` in
// `src/lib/auth/otp.ts`) — only the identity string differs:
//   phone → the normalized phone as sent (`+7999…`)
//   email → `email.trim().toLowerCase()`  (Zod `.trim().email()` then `.toLowerCase()`)
// Getting that normalization wrong yields a silent 900k-iteration miss, so it
// is mirrored exactly rather than approximated.

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
// FIX-D1: вывод имён ключей — из того же модуля, которым пользуется рантайм.
// Модуль намеренно без зависимостей (только `crypto`), поэтому импортируется
// из обычного tsx-скрипта, минуя `server-only` у redis-корня.
import { allOtpRateLimitKeys } from "../src/lib/auth/otp-rate-limit-keys";

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

function hashOtp(identity: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${identity}:${code}`).digest("hex");
}

/**
 * Who is logging in. A bare string stays valid so every existing call site
 * compiles untouched (`recoverOtp(role.phone)`, `clearOtpRateLimit([phone])`);
 * it is classified by `@` — phones here always start with `+`, emails always
 * contain `@`, so the two spaces cannot collide. The object forms exist for
 * call sites that would rather be explicit than rely on that.
 */
export type OtpIdentity = string | { phone: string } | { email: string };

export type ResolvedIdentity =
  | { channel: "phone"; value: string }
  | { channel: "email"; value: string };

/**
 * Normalizes an identity **the way the product does** — this is the part that
 * must not drift, because a wrong preimage looks exactly like "no code yet".
 * Email: `.trim().toLowerCase()` (Zod `.trim().email()` → route `.toLowerCase()`).
 * Phone: passed through as the caller sends it, matching today's behaviour.
 */
export function resolveIdentity(identity: OtpIdentity): ResolvedIdentity {
  if (typeof identity === "string") {
    return identity.includes("@")
      ? { channel: "email", value: identity.trim().toLowerCase() }
      : { channel: "phone", value: identity };
  }
  if ("email" in identity) {
    return { channel: "email", value: identity.email.trim().toLowerCase() };
  }
  return { channel: "phone", value: identity.phone };
}

function latestUnusedCodeHash(id: ResolvedIdentity): string | null {
  const safe = id.value.replace(/'/g, "''");
  // Each branch mirrors the corresponding product query verbatim:
  //   phone → `otp/verify/route.ts`      (no channel filter)
  //   email → `otp/email/verify/route.ts` (channel = 'EMAIL')
  // The email channel filter is not cosmetic: `OtpCode` rows keyed by email are
  // ALSO written by the cabinet email-verification flow
  // (`/api/cabinet/user/profile/email/request-verify`), and both carry
  // `channel = EMAIL`. `ORDER BY createdAt DESC` is what disambiguates them —
  // same rule the product applies, so the harness can never pick a code the
  // product would have rejected.
  const where =
    id.channel === "phone"
      ? `phone = '${safe}'`
      : `email = '${safe}' AND channel = 'EMAIL'`;
  const sql = `SELECT "codeHash" FROM "OtpCode" WHERE ${where} AND "usedAt" IS NULL AND "expiresAt" > now() ORDER BY "createdAt" DESC LIMIT 1;`;
  const value = psql(sql);
  return value.length > 0 ? value : null;
}

/**
 * Recovers the plaintext OTP for a phone OR an email by brute-forcing the
 * latest unused codeHash. Retries the DB read briefly in case the request just
 * landed.
 *
 * ⚠️ Email timing note (QA-HARNESS-EMAIL-01): the request route writes the
 * `OtpCode` row BEFORE it awaits `sendEmail`, so the row is readable ~1.5 s in
 * even when SMTP hangs — but the HTTP response (and therefore the UI's OTP
 * step) waits for the send. With the dev mail sink running that wait is
 * milliseconds; without it, ~21 s. See `docker-compose.dev.yml` (mailpit).
 */
export async function recoverOtp(identity: OtpIdentity): Promise<string> {
  const secret = env.OTP_HMAC_SECRET;
  if (!secret) {
    throw new Error("OTP_HMAC_SECRET not found in .env / .env.local");
  }

  const id = resolveIdentity(identity);

  let target: string | null = null;
  for (let attempt = 0; attempt < 10 && !target; attempt += 1) {
    target = latestUnusedCodeHash(id);
    if (!target) await new Promise((r) => setTimeout(r, 250));
  }
  if (!target) {
    throw new Error(`No unused OtpCode row found for ${id.channel} ${id.value}`);
  }

  for (let code = 100000; code <= 999999; code += 1) {
    const candidate = String(code);
    if (hashOtp(id.value, candidate, secret) === target) {
      return candidate;
    }
  }
  throw new Error(`Could not recover OTP for ${id.channel} ${id.value} (no 6-digit match)`);
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
 *
 * ⚠️ QA-HARNESS-EMAIL-01 — у email СВОИ ключи, и это ровно тот же класс бага,
 * что чинил GATES-FIX-01, только на втором канале. Verify-тир у email лежит под
 * ДРУГИМ префиксом — `otp:verify:email:lock:` против фонового
 * `otp:verify:lock:`.
 *
 * 🔴 **FIX-D1 — карта ключей больше здесь НЕ ведётся.** Она велась (список из
 * шести строк, «источник — `src/lib/auth/otp-rate-limit.ts`») и протухла молча
 * дважды, что и нашёл SMOKE-02 · Ф-2:
 *
 *   1. предполагалось, что на localhost продукт хеширует строку `"unknown"`;
 *      на деле `extractClientIp` возвращает `::1`, поэтому IP-счётчик не
 *      снимался НИКОГДА;
 *   2. SEC-26 добавил второе измерение (`otp:request:{phone,email}-ip:`), и
 *      список про него не узнал вовсе.
 *
 * Цена — не неудобство: серия холодных логинов упирается в `429`, а по симптому
 * это неотличимо от сломанного логина, то есть инструмент проверки продукта сам
 * производит ложные отказы. Поэтому имена ключей теперь ИМПОРТИРУЮТСЯ из
 * `src/lib/auth/otp-rate-limit-keys.ts` — того самого модуля, из которого их
 * берёт рантайм. Новое измерение лимита появляется здесь само.
 *
 * ⚠️ Единственное, что харнесс всё ещё угадывает, — сам IP: он средовой, и узнать
 * его со стороны нельзя. Поэтому чистится набор петлевых форм (`::1`,
 * `::ffff:127.0.0.1`, `127.0.0.1`) плюс `null`-случай (`"unknown"`). Это ВХОД
 * вывода, а не сам вывод; вывод — общий.
 */
/**
 * Петлевые формы, в которых продукт может увидеть локального клиента, плюс
 * `null`-случай. Дешевле почистить все, чем угадать одну и снова получить 429,
 * неотличимый от поломки логина.
 */
const LOCAL_IP_FORMS = ["::1", "::ffff:127.0.0.1", "127.0.0.1", "unknown"] as const;

export function clearOtpRateLimit(identities: OtpIdentity[], ip?: string): void {
  const keys = new Set<string>();
  const ipForms = ip ? [ip] : LOCAL_IP_FORMS;
  for (const identity of identities) {
    const id = resolveIdentity(identity);
    for (const form of ipForms) {
      for (const key of allOtpRateLimitKeys(id.channel, id.value, form)) keys.add(key);
    }
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
