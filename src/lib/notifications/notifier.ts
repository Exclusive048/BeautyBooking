import { EventEmitter } from "node:events";
import type { RedisClientType } from "redis";

import {
  getRedisConnection,
  getRedisSubscriberConnection,
  withRedisCommandTimeout,
} from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import type { NotificationEvent } from "@/lib/notifications/types";
import { isProduction } from "@/lib/env";

const allowMemoryNotifierFallback = !isProduction;

export type NotifierRuntimeStatus = {
  mode: "redis" | "memory" | "unavailable";
  ready: boolean;
  reason: string | null;
};

let notifierRuntimeStatus: NotifierRuntimeStatus = {
  mode: "unavailable",
  ready: false,
  reason: "not-initialized",
};

export type NotificationSubscriber = (event: NotificationEvent) => void;

export type NotificationNotifier = {
  publish: (userId: string, event: NotificationEvent) => void;
  subscribe: (userId: string, handler: NotificationSubscriber) => () => void;
};

class MemoryNotificationNotifier implements NotificationNotifier {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(500);
  }

  publish(userId: string, event: NotificationEvent) {
    this.emitter.emit(userId, event);
  }

  subscribe(userId: string, handler: NotificationSubscriber) {
    this.emitter.on(userId, handler);
    return () => {
      this.emitter.off(userId, handler);
    };
  }
}

class RedisNotificationNotifier implements NotificationNotifier {
  constructor(
    private publisherClient: RedisClientType,
    private subscriberClient: RedisClientType
  ) {}

  /**
   * FIX-C4: все три команды ограничены сверху. Здесь дефект тише, чем на
   * запросных путях, и потому опаснее: вызовы — fire-and-forget, поэтому
   * молчащий Redis не вешал запрос, а оставлял висеть промис НАВСЕГДА.
   * Пост-дедлайн у всех трёх — существующий `catch` с `logError`, то есть
   * отказ становится наблюдаемым вместо бесшумного. ⚠️ У `subscribe` это
   * особенно важно: SSE-подписка «устанавливалась» и не получала событий
   * никогда, а в логах не было ничего.
   */
  publish(userId: string, event: NotificationEvent): void {
    const channel = `notifications:${userId}`;
    const payload = JSON.stringify(event);

    void withRedisCommandTimeout("notifier:publish", this.publisherClient.publish(channel, payload)).catch((error) => {
      logError("Notifications publish failed", {
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  subscribe(userId: string, handler: NotificationSubscriber): () => void {
    const channel = `notifications:${userId}`;

    const redisHandler = (message: string) => {
      try {
        const event = JSON.parse(message) as NotificationEvent;
        handler(event);
      } catch (error) {
        logError("Notifications payload parse failed", {
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void withRedisCommandTimeout("notifier:subscribe", this.subscriberClient.subscribe(channel, redisHandler)).catch((error) => {
      logError("Notifications subscribe failed", {
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      void withRedisCommandTimeout("notifier:unsubscribe", this.subscriberClient.unsubscribe(channel, redisHandler)).catch((error) => {
        logError("Notifications unsubscribe failed", {
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    };
  }
}

async function createNotifier(): Promise<NotificationNotifier> {
  const publisherClient = await getRedisConnection();
  const subscriberClient = await getRedisSubscriberConnection();
  if (!publisherClient || !subscriberClient) {
    if (!allowMemoryNotifierFallback) {
      notifierRuntimeStatus = {
        mode: "unavailable",
        ready: false,
        reason: "redis-required",
      };
      throw new Error("Redis is required for notifications notifier in production");
    }
    notifierRuntimeStatus = {
      mode: "memory",
      ready: true,
      reason: "redis-unavailable-fallback",
    };
    return new MemoryNotificationNotifier();
  }
  notifierRuntimeStatus = {
    mode: "redis",
    ready: true,
    reason: null,
  };
  return new RedisNotificationNotifier(publisherClient, subscriberClient);
}

/**
 * RES-02 — нотифаер создаётся ЛЕНИВО и с ограниченным ретраем.
 *
 * Раньше здесь стояла eager-константа `createNotifier()`: промис создавался на
 * module-eval и кэшировался навсегда. Если Redis был недоступен именно в этот
 * момент (его рестарт, гонка при деплое — `depends_on: service_healthy`
 * страхует только ПЕРВЫЙ старт, не последующие рестарты Redis), промис
 * оставался отклонённым до конца жизни процесса. Восстановление Redis ничего
 * не меняло: `createNotifier` больше не вызывался, `notifierRuntimeStatus`
 * больше не пересчитывался.
 *
 * Цена: SSE `/api/notifications/stream` отдаёт 503 `NOTIFIER_UNAVAILABLE` всем
 * пользователям, `publish` не работает — а in-app уведомления это единственный
 * всегда включённый канал (Telegram погашен killswitch'ем, push опционален).
 * Отдельно ломался runbook `docs/runbooks/redis-down.md`: он предлагает ждать
 * `notifier.mode = "redis"` как признак устранения инцидента, а этот признак
 * без рестарта контейнера не появлялся бы никогда.
 *
 * Успешный нотифаер кэшируется навсегда — пересоздавать рабочее соединение
 * незачем. Кэшируется именно УСПЕХ: отказ сбрасывает кэш, чтобы следующий
 * вызов попробовал снова, но не чаще, чем раз в `NOTIFIER_RETRY_COOLDOWN_MS`,
 * — иначе каждый SSE-коннект долбил бы лежащий Redis.
 */
export const NOTIFIER_RETRY_COOLDOWN_MS = 5_000;

let notifierPromise: Promise<NotificationNotifier> | null = null;
let lastFailure: { error: unknown; at: number } | null = null;

export function getNotificationsNotifier(): Promise<NotificationNotifier> {
  if (notifierPromise) return notifierPromise;

  if (lastFailure && Date.now() - lastFailure.at < NOTIFIER_RETRY_COOLDOWN_MS) {
    return Promise.reject(lastFailure.error);
  }

  const attempt = createNotifier();
  notifierPromise = attempt;
  attempt.catch((error) => {
    // Отказ не должен закрепиться результатом: снимаем кэш, чтобы следующая
    // попытка после кулдауна действительно состоялась.
    if (notifierPromise === attempt) notifierPromise = null;
    lastFailure = { error, at: Date.now() };
  });
  return attempt;
}

/** Только для тестов: забыть и успешный нотифаер, и момент последнего отказа. */
export function resetNotificationsNotifierForTests(): void {
  notifierPromise = null;
  lastFailure = null;
  notifierRuntimeStatus = { mode: "unavailable", ready: false, reason: "not-initialized" };
}

export function getNotificationsNotifierRuntimeStatus(): NotifierRuntimeStatus {
  return notifierRuntimeStatus;
}
