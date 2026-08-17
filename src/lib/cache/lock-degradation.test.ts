import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { createSilentRedis } from "@/lib/testing/silent-redis";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * FIX-C11 — у КАЖДОГО вызывающего замка своя деградация, и она названа.
 *
 * ## Предмет
 *
 * Проверяется не «ошибка поймана», а **что происходит** при недоступной
 * зависимости, — потому что именно подмена одного другим и была дефектом:
 * `withSingleFlight` «обрабатывал» отказ (полагаясь на `false`), а на деле не
 * обрабатывал ничего.
 *
 * Стек настоящий: `claimLock` → `cache.ts` → `redisClient` →
 * `withRedisCommandTimeout` → стенд молчащего Redis. Таймеры не подменяются.
 *
 * @probe   что сломать: в `lib/cache/cache.ts` убрать `try/catch` из
 *          `claimLock` (вернуть сырой `setNx`).
 *          наблюдалось: «Redis command timeout: operation=cache:setNx» — красный
 *          на «недоступность приходит третьим состоянием» и на обоих
 *          вызывающих. Восстановлено, зелено.
 */

const silent = vi.hoisted(() => ({
  handle: null as ReturnType<typeof createSilentRedis> | null,
}));

vi.mock("@/lib/env", () => ({
  env: { REDIS_URL: "redis://silent:6379", NODE_ENV: "test" },
  isProduction: false,
}));
vi.mock("@/lib/redis/connection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redis/connection")>(
    "@/lib/redis/connection",
  );
  return {
    ...actual,
    getRedisConnection: async () => silent.handle!.client,
    getRedisSubscriberConnection: async () => silent.handle!.client,
  };
});
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));

const { resetRedisCircuit } = await import("@/lib/redis/connection");
const { claimLock } = await import("@/lib/cache/cache");
const { checkAndSetIdempotency, setIdempotencyPending } = await import(
  "@/lib/idempotency/idempotency"
);
const { claimNotificationDedup, NotificationDedupUnavailableError } = await import(
  "@/lib/notifications/dedup-guard"
);

beforeEach(() => {
  silent.handle?.release();
  silent.handle = createSilentRedis();
  resetRedisCircuit();
});

describe("FIX-C11 · граница переводит отказ замка в НАЗВАННОЕ третье состояние", () => {
  it(
    "недоступность приходит третьим состоянием, а не исключением и не «занято»",
    async () => {
      const claim = await claimLock("lock:x", "1", 30);

      expect(claim.status, "«занято» здесь было бы ложью: мы не смогли проверить").toBe(
        "unavailable",
      );
      // Ошибка сохраняется: вызывающие, которые логируют причину (telegram,
      // прогон продлений), обязаны иметь что логировать.
      expect(claim).toHaveProperty("error");
    },
    20_000,
  );
});

describe("FIX-C11 · идемпотентность отказывает (гарантию выдать нечем)", () => {
  it(
    "checkAndSetIdempotency бросает, а не пропускает запрос",
    async () => {
      // 🔴 Пропустить значило бы молча снять инв. #28: повторный POST создал бы
      // вторую сущность. Отказ здесь — единственный честный ответ.
      await expect(checkAndSetIdempotency("idem:x", 600)).rejects.toThrow(
        "Service temporarily unavailable",
      );
    },
    20_000,
  );

  it(
    "setIdempotencyPending — то же самое (обе точки входа, не одна)",
    async () => {
      await expect(setIdempotencyPending("idem:y", 600)).rejects.toThrow(
        "Service temporarily unavailable",
      );
    },
    20_000,
  );
});

describe("FIX-C11 · dedup-сторож уведомлений не рассылает", () => {
  it(
    "claimNotificationDedup бросает именованную ошибку, а не разрешает рассылку",
    async () => {
      // Дубликат здесь виден пользователю и неотзываем; пропуск — потеря
      // необязательного уведомления. Семантика сохраняет доFIX-C11-поведение,
      // но теперь она ВЫБРАНА, а не унаследована от отсутствия `try/catch`.
      await expect(claimNotificationDedup("dedup:x", 3600)).rejects.toBeInstanceOf(
        NotificationDedupUnavailableError,
      );
    },
    20_000,
  );
});

/**
 * Полнота: у каждого вызывающего замка деградация ВЫБРАНА и записана здесь.
 *
 * Список перечисляет тех, КОМУ можно, а не тех, кого проверяем (тот же приём,
 * что у инв. #25 и #35): новый файл, зовущий `claimLock`, валит тест просто
 * потому, что его тут нет, — и автор обязан назвать семантику, а не унаследовать
 * её молчанием. Ровно так дефект и появился: три сайта не выбирали ничего.
 */
describe("FIX-C11 · новый вызывающий замка обязан назвать свою деградацию", () => {
  it("инвентарь потребителей claimLock совпадает с зарегистрированным", () => {
    const root = resolve(process.cwd(), "src");
    const callers = listSourceFiles(root)
      .filter((full) => {
        const source = stripComments(readFileSync(full, "utf8"));
        // Форма ВЫЗОВА, а не упоминание имени: строка импорта и проза в
        // комментарии не должны засчитываться (урок инв. #11 — `includes()`
        // удовлетворялся импортом).
        return /\bclaimLock\s*\(/.test(source);
      })
      // Сам фасад объявляет `claimLock`, потребителем не является.
      .filter((full) => !full.endsWith(join("lib", "cache", "cache.ts")))
      .map((full) => `src/${relative(root, full).replace(/\\/g, "/")}`);

    const REGISTERED: Record<string, string> = {
      // Пропустить замок и посчитать: дубль дешевле отказа (Правило 2).
      "src/lib/cache/single-flight.ts": "compute-without-lock",
      // Отказать: без замка гарантию инв. #28 выдать нечем.
      "src/lib/idempotency/idempotency.ts": "refuse",
      // Не рассылать: дубликат виден пользователю (см. заголовок модуля).
      "src/lib/notifications/dedup-guard.ts": "refuse",
      // Пропустить: основная CSRF-защита — single-use state-cookie.
      "src/lib/auth/telegram-login-state.ts": "allow",
      // Продолжить без замка: деньги держит инв. #4, а не Redis (LOGIC-07).
      "src/app/api/billing/renew/run/route.ts": "proceed-without-lock",
    };

    expect(
      callers.sort(),
      "у вызывающего замка нет записанной деградации — назовите её в REGISTERED " +
        "и в самом файле: молчание здесь и есть дефект FIX-C11",
    ).toEqual(Object.keys(REGISTERED).sort());
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
