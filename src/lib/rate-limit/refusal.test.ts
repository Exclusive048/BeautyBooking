import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { createSilentRedis } from "@/lib/testing/silent-redis";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * FIX-C11 · GUEST-BOOKING-OUTAGE-CODE-ASYMMETRY — отказ при обрыве отличим от
 * отказа по бюджету.
 *
 * Политика НЕ меняется: и то, и другое — отказ (инв. #6, fail-closed, замерено
 * FIX-C10). Проверяется ровно то, что читает человек и на что реагирует клиент.
 *
 * @probe   что сломать: в `lib/rate-limit/refusal.ts` убрать ветку
 *          `if (unavailable)` (то есть вернуть единственный 429).
 *          наблюдалось: «обрыв обязан читаться как 503 … получено 429» —
 *          красный на обоих поведенческих тестах. Восстановлено, зелено.
 *
 *          Второй пробой (правдоподобная форма, правило 9): вернуть в
 *          `api/public/bookings/route.ts` legacy-перегрузку
 *          `checkRateLimit(phoneKey, RATE.limit, RATE.windowSeconds)` —
 *          наблюдалось «legacy-перегрузка вернулась на путь записи брони:
 *          src/app/api/public/bookings/route.ts» из инвентаря ниже.
 */

const silent = vi.hoisted(() => ({
  handle: null as ReturnType<typeof createSilentRedis> | null,
  healthy: false,
}));

/** Живой Redis: `incr`/`expire` работают. Моделирует ЗДОРОВУЮ зависимость. */
const counters = vi.hoisted(() => new Map<string, number>());
const healthyClient = vi.hoisted(() => ({
  incr: async (key: string) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  },
  expire: async () => 1,
}));

vi.mock("@/lib/redis/connection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redis/connection")>(
    "@/lib/redis/connection",
  );
  return {
    ...actual,
    getRedisConnection: async () =>
      silent.healthy ? healthyClient : silent.handle!.client,
    getRedisSubscriberConnection: async () => silent.handle!.client,
  };
});
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));
vi.mock("@/lib/monitoring/alerts", () => ({
  sendTelegramAlert: async () => {},
  trackError: () => 1,
}));
vi.mock("@/lib/env", () => ({ isProduction: false, env: { REDIS_URL: "redis://x" } }));

const { resetRedisCircuit } = await import("@/lib/redis/connection");
const { checkRateLimit } = await import("@/lib/rate-limit");
const { resolveRateLimitRefusal } = await import("@/lib/rate-limit/refusal");

// Ключ ПИШУЩЕГО гостевого пути — он в `SENSITIVE_KEY_PREFIXES`, то есть
// fail-closed. На несенситивном ключе теста не было бы вовсе: там fail-open.
const GUEST_KEY = "rate:publicBooking:phone:+79991234567";
const RATE = { maxRequests: 5, windowSeconds: 60 };

beforeEach(() => {
  silent.handle?.release();
  silent.handle = createSilentRedis();
  silent.healthy = false;
  counters.clear();
  resetRedisCircuit();
});

describe("FIX-C11 · форма отказа называет причину", () => {
  it(
    "🔴 обрыв зависимости → 503 RATE_LIMIT_UNAVAILABLE (первый запрос гостя)",
    async () => {
      const result = await checkRateLimit(GUEST_KEY, RATE);
      const refusal = resolveRateLimitRefusal(result);

      expect(refusal, "путь обязан отказать — это fail-closed, инв. #6").not.toBeNull();
      expect(
        refusal!.status,
        "обрыв обязан читаться как 503 «повторите», а не 429 «вы слишком часто»: " +
          "гость здесь делает ПЕРВЫЙ запрос",
      ).toBe(503);
      expect(refusal!.code).toBe("RATE_LIMIT_UNAVAILABLE");
      expect(refusal!.message).toContain("недоступен");
    },
    20_000,
  );

  it("исчерпанный бюджет при ЖИВОЙ зависимости → 429 RATE_LIMITED", async () => {
    silent.healthy = true;

    // Невакуумность: в пределах бюджета отказа быть не должно вовсе.
    for (let i = 0; i < RATE.maxRequests; i++) {
      expect(resolveRateLimitRefusal(await checkRateLimit(GUEST_KEY, RATE))).toBeNull();
    }

    const refusal = resolveRateLimitRefusal(await checkRateLimit(GUEST_KEY, RATE));
    expect(refusal).not.toBeNull();
    expect(refusal!.status).toBe(429);
    expect(refusal!.code).toBe("RATE_LIMITED");
  });

  it("две оси: недоступность одной перевешивает исчерпанный бюджет другой", async () => {
    // Иначе гость при обрыве читал бы «слишком много запросов» просто потому,
    // что вторая ось успела посчитаться.
    const refusal = resolveRateLimitRefusal(
      { limited: true, retryAfterSeconds: 60 },
      { limited: true, retryAfterSeconds: 60, reason: "unavailable" },
    );
    expect(refusal!.status).toBe(503);
  });

  it("пройденный лимит — не отказ", () => {
    expect(resolveRateLimitRefusal({ limited: false }, { limited: false })).toBeNull();
  });
});

/**
 * Замороженный инвентарь legacy-перегрузки (`checkRateLimit(key, limit, window)`).
 *
 * Она возвращает `boolean` и причину выразить НЕ МОЖЕТ — именно поэтому четыре
 * пишущих пути записи брони отвечали 429 при обрыве. Перегрузка остаётся: у
 * оставшихся сайтов вызывающий не человек (телеграм-бот) либо отказ не лежит на
 * пути записи. Инвентарь заморожен, чтобы возврат на путь брони был красным
 * тестом, а не молчаливым 429 на боевом экране.
 */
/**
 * Считает вызовы `checkRateLimit` с ТРЕМЯ аргументами верхнего уровня.
 *
 * ⚠️ Регексп здесь не годится и это проверено: `[^)]*?,[^),]*,[^)]*` считает
 * запятые ВНУТРИ объекта-конфига (`{ maxRequests, windowSeconds }`) и объявляет
 * legacy-формой все 16 сайтов, включая саму перегрузку. Нужна глубина скобок.
 */
function countLegacyCallSites(source: string): number {
  const NAME = "checkRateLimit(";
  let count = 0;
  let from = 0;

  for (;;) {
    const at = source.indexOf(NAME, from);
    if (at === -1) return count;
    from = at + NAME.length;

    // Объявления самой перегрузки (`export async function checkRateLimit(`)
    // аргументов не передают — их отсекает проверка на `function` слева.
    const before = source.slice(Math.max(0, at - 40), at);
    if (/\bfunction\s+$/.test(before)) continue;

    // Считаем НЕПУСТЫЕ сегменты, а не запятые: висячая запятая
    // (`checkRateLimit(\n  key,\n  RATE_LIMITS.x,\n)`) — норма в этом проекте,
    // и по запятым она давала третий «аргумент». Поймано пробой: так шесть
    // сайтов перегрузки с конфигом попали в инвентарь как legacy.
    let depth = 1;
    let i = from;
    let current = "";
    const segments: string[] = [];

    while (i < source.length && depth > 0) {
      const ch = source[i]!;
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;

      if (depth === 0) break;
      if (ch === "," && depth === 1) {
        segments.push(current);
        current = "";
      } else {
        current += ch;
      }
      i += 1;
    }
    segments.push(current);

    if (segments.filter((segment) => segment.trim().length > 0).length >= 3) count += 1;
  }
}

describe("FIX-C11 · legacy-перегрузка не возвращается на пути записи брони", () => {
  it("инвентарь сайтов boolean-перегрузки совпадает с замороженным", () => {
    const root = resolve(process.cwd(), "src");
    const found: string[] = [];
    for (const full of listSourceFiles(root)) {
      const source = stripComments(readFileSync(full, "utf8"));
      if (countLegacyCallSites(source) > 0) {
        found.push(`src/${relative(root, full).replace(/\\/g, "/")}`);
      }
    }

    const FROZEN = [
      // Отказ не лежит на пути записи брони, вызывающий переживает 429:
      "src/app/api/log-error/route.ts",
      "src/app/api/support/partnership/route.ts",
      "src/app/api/support/tickets/route.ts",
      // Вызывающий — телеграм-бот со своими ретраями, не браузер (FIX-B15).
      "src/lib/telegram/webhookRateLimit.ts",
      // Ключ `rate:advisorRefresh:` не сенситивный → при обрыве не отказывает
      // вовсе (memory-fallback), поэтому асимметрии кодов у него нет.
      "src/app/api/master/advisor/refresh/route.ts",
      /**
       * ✅ `rate:chatSend:` ВЫБЫЛ отсюда — переведён FIX-C12.
       *
       * Он был последним сайтом того же дефекта: ключ в
       * `SENSITIVE_KEY_PREFIXES` (FIX-B12), то есть при обрыве отказ ЕСТЬ, и
       * пользователь, отправляющий ПЕРВОЕ сообщение, читал «Слишком много
       * сообщений». Теперь роут зовёт перегрузку с конфигом и
       * `resolveRateLimitRefusal`; своя копия текста сохранена для 429
       * («сообщений», не «запросов»), 503 идёт общей строкой.
       *
       * Оставшиеся четыре сайта — не тот класс: у них либо вызывающий не
       * человек, либо ключ не сенситивный, то есть отказа при обрыве нет.
       */
    ].sort();

    expect(
      found.sort(),
      "legacy-перегрузка вернулась на путь записи брони либо появился новый сайт: " +
        "она не умеет отличить обрыв от бюджета, поэтому отказ прочитается как 429",
    ).toEqual(FROZEN);
  });
});

const IGNORED_DIRS = new Set(["node_modules"]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}
