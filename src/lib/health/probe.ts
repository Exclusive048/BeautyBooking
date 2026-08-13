import "server-only";

import { prisma } from "@/lib/prisma";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { env } from "@/lib/env";

/**
 * FIX-C2 · SMOKE-01 · F2 — ограниченные сверху проверки зависимостей для
 * health-проб.
 *
 * ## Что было
 *
 * `GET /api/health` при остановленном Redis **не завершался вообще**: замер по
 * четырём клиентским таймаутам (10 / 30 / 90 / 240 с) дал длительность, равную
 * таймауту клиента, а не свойству сервера. Тело не пришло ни разу.
 *
 * Виновата ровно одна строка — `await client.ping()` (`api/health/route.ts:21`),
 * **без** `withRedisCommandTimeout`. Это не «забыли таймаут у сетевого вызова»,
 * а конкретный механизм `redis@5`, уже описанный RES-01: проект не выставляет
 * `disableOfflineQueue`, а его `reconnectStrategy` не сдаётся никогда
 * (`Math.min(retries * 100, 2000)`), поэтому во время реконнекта `socket.isOpen`
 * остаётся `true`, `sendCommand` промис **не отклоняет**, и команда уходит в
 * offline-очередь ждать соединения, которого не будет. `try/catch` вокруг
 * бесполезен: отклонения нет — есть отсутствие ответа.
 *
 * ⚠️ Мягкая ветка `getRedisConnection() → null` тут не срабатывает: она про
 * отказ на ПЕРВОМ коннекте (там `client.connect()` уже обёрнут таймаутом), а
 * боевой сценарий другой — клиент успешно подключился при живом Redis и
 * закэширован в `globalThis`, а упал Redis потом. Именно поэтому дефект не
 * воспроизводится «холодным» стартом без Redis и прожил до живого прогона.
 *
 * Находка была известна: `AUDIT-FRESH-03` § 4 назвала и файл, и строку, и
 * причину. Не сделано — потому что чинить предлагалось таймаут, а вопрос
 * стоял шире (см. решение liveness/readiness в шапке `api/health/ready`).
 *
 * ## Почему `Promise.race` вокруг Prisma здесь законен
 *
 * У проекта есть ратифицированный отказ гоняться с Prisma — `src/proxy.ts`
 * (PERF-14): `race` не отменяет запрос, поэтому ротация сессии успела бы
 * пометить refresh-токен использованным, не доставив куку. Здесь этого
 * возражения нет и не может быть: проба — `SELECT 1`, **чтение без побочных
 * эффектов**, недоводить его нечего. Мы перестаём ЖДАТЬ ответ, а не отменяем
 * работу; запрос дойдёт до своего `statement_timeout=30000` (RES-24) сам.
 */

/**
 * Бюджет одной зависимости. Обе проверки идут ПАРАЛЛЕЛЬНО, поэтому это же
 * значение — верхняя граница всей readiness-пробы, а не её половина.
 *
 * 2 с выбраны от потребителя, а не «на глаз»: compose-healthcheck даёт
 * `timeout: 10s`, и проба обязана уложиться в него с запасом на прокси, который
 * при обрыве Redis тратит ещё ~2.5 с на собственный rate-limit (замер
 * `SMOKE-01 · F5`). Значение НИЖЕ `REDIS_COMMAND_TIMEOUT_MS` (2.5 с)
 * намеренно — здесь мы не выполняем полезную команду, а спрашиваем «жив ли»,
 * и ответ «не ответил за 2 с» для этого вопроса исчерпывающий.
 */
export const HEALTH_DEPENDENCY_TIMEOUT_MS = 2_000;

/**
 * `down` и `disabled` — разные состояния, и их нельзя схлопывать: Redis без
 * `REDIS_URL` в dev это осознанная конфигурация (memory-fallback), а не авария,
 * и дежурный не должен искать несуществующий инцидент.
 */
export type DependencyState = "ok" | "down" | "disabled";

export type ReadinessReport = {
  db: DependencyState;
  redis: DependencyState;
  /** Фактическая длительность пробы — сигнал brownout'а, а не только отказа. */
  checkedInMs: number;
};

function deadline(operation: string, timeoutMs: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`health probe timeout: operation=${operation}, timeoutMs=${timeoutMs}`));
    }, timeoutMs);
  });
  return {
    promise,
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

export async function checkDatabase(
  timeoutMs = HEALTH_DEPENDENCY_TIMEOUT_MS,
): Promise<DependencyState> {
  const limit = deadline("health:db", timeoutMs);
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, limit.promise]);
    return "ok";
  } catch {
    return "down";
  } finally {
    limit.cancel();
  }
}

export async function checkRedis(
  timeoutMs = HEALTH_DEPENDENCY_TIMEOUT_MS,
): Promise<DependencyState> {
  if (!env.REDIS_URL?.trim()) return "disabled";

  try {
    // Обе ноги под ОДНОЙ границей: `getRedisConnection` бывает дорогим на
    // холодном старте (собственный connect-таймаут 3 с), а `ping` — тем самым
    // вызовом, который висит вечно. Раздельные бюджеты сложились бы в сумму,
    // превышающую бюджет всей пробы.
    const state = await withRedisCommandTimeout(
      "health:redis",
      (async () => {
        const client = await getRedisConnection();
        // `null` здесь — отказ первого коннекта (см. шапку), то есть Redis
        // сконфигурирован и недоступен. Это `down`, не `disabled`.
        if (!client) return "down" as const;
        await client.ping();
        return "ok" as const;
      })(),
      timeoutMs,
    );
    return state;
  } catch {
    return "down";
  }
}

/** Обе зависимости параллельно: общая граница = максимум, а не сумма. */
export async function checkReadiness(
  timeoutMs = HEALTH_DEPENDENCY_TIMEOUT_MS,
): Promise<ReadinessReport> {
  const startedAt = Date.now();
  const [db, redis] = await Promise.all([checkDatabase(timeoutMs), checkRedis(timeoutMs)]);
  return { db, redis, checkedInMs: Date.now() - startedAt };
}
