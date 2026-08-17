import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RES-11 — команды Redis в OTP-лимитере шли голыми, без command-таймаута.
 *
 * Модуль написан fail-closed: любой отказ Redis ловится и превращается в 503
 * `RATE_LIMIT_UNAVAILABLE` / 429. Но ловится только то, что ОТКЛОНИЛОСЬ, а во
 * время brownout'а (`redis@5` на реконнекте) команда не отклоняется вовсе:
 * `socket.isOpen` остаётся `true`, промис не settl'ится, команда уходит в
 * offline-очередь. То есть выпуск OTP висел бы на первом дребезге, а
 * fail-closed-ветка — ради которой всё и написано — оставалась недостижимой.
 *
 * Тест моделирует именно этот отказ: команда, которая не резолвится НИКОГДА.
 * Без обёртки он не «падает по ассерту», а висит до принудительного таймаута
 * vitest — что и есть доказательство.
 */

const getRedisConnection = vi.hoisted(() => vi.fn());
const TIMEOUT_MS = 50;

vi.mock("@/lib/redis/connection", async () => {
  // Настоящая обёртка — проверяем поведение, а не заглушку.
  const actual =
    await vi.importActual<typeof import("@/lib/redis/connection")>("@/lib/redis/connection");
  return {
    getRedisConnection,
    withRedisCommandTimeout: <T>(operation: string, promise: Promise<T>) =>
      actual.withRedisCommandTimeout(operation, promise, TIMEOUT_MS),
  };
});
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ alertOtpRateLimitTriggered: vi.fn() }));

import {
  checkOtpRequestRateLimit,
  checkOtpVerifyLock,
  registerOtpVerifyFailure,
} from "@/lib/auth/otp-rate-limit";

/** Клиент, чьи команды не резолвятся никогда — тот самый brownout. */
function hangingClient() {
  const never = () => new Promise(() => {});
  return {
    incr: never,
    expire: never,
    ttl: never,
    set: never,
    del: never,
    get: never,
  };
}

describe("RES-11 · OTP-лимитер переживает brownout Redis", () => {
  beforeEach(() => {
    getRedisConnection.mockReset();
    getRedisConnection.mockResolvedValue(hangingClient());
  });

  it("запрос кода: зависшая команда даёт fail-closed 503, а не висит", async () => {
    const result = await checkOtpRequestRateLimit({ phone: "+79991234567", ip: "1.2.3.4" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toBe("RATE_LIMIT_UNAVAILABLE");
    }
  });

  it("проверка кода: зависшая команда даёт отказ 429, а не висит", async () => {
    await expect(checkOtpVerifyLock("+79991234567", "1.2.3.4")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("учёт неудачной попытки: зависшая команда даёт отказ 429, а не висит", async () => {
    await expect(registerOtpVerifyFailure("+79991234567", "1.2.3.4")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("ни одна команда модуля не ходит в Redis мимо обёртки", () => {
    // Пятнадцать вызовов в шести функциях: пропустить один — вернуть дефект
    // ровно на том пути, который его пропустил.
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/auth/otp-rate-limit.ts"),
      "utf8"
    );
    const bare = source
      .split("\n")
      .filter((line) => /client\.(incr|expire|ttl|set|del|get)\(/.test(line))
      .filter((line) => !line.includes("withRedisCommandTimeout"));
    expect(bare).toEqual([]);
  });
});
