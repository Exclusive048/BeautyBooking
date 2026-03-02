import { EventEmitter } from "node:events";
import { createClient } from "redis";
import type { NotificationType, Prisma } from "@prisma/client";

import { getRedisConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";

export type NotificationEvent = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson: Prisma.JsonValue;
  createdAt: string;
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
  private memory = new MemoryNotificationNotifier();
  private publishClientPromise = getRedisConnection();
  private subscriberClientPromise = this.createSubscriberClient();

  publish(userId: string, event: NotificationEvent) {
    const channel = `notifications:${userId}`;
    const payload = JSON.stringify(event);

    void this.publishClientPromise
      .then(async (client) => {
        if (!client) {
          this.memory.publish(userId, event);
          return;
        }
        try {
          await client.publish(channel, payload);
        } catch (error) {
          logError("Notifications publish failed", {
            channel,
            error: error instanceof Error ? error.message : String(error),
          });
          this.memory.publish(userId, event);
        }
      })
      .catch((error) => {
        logError("Notifications publish connection failed", {
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
        this.memory.publish(userId, event);
      });
  }

  subscribe(userId: string, handler: NotificationSubscriber) {
    const channel = `notifications:${userId}`;
    const memoryUnsub = this.memory.subscribe(userId, handler);
    let pendingUnsubscribe = false;
    let subscribed = false;
    let subscriberClient: ReturnType<typeof createClient> | null = null;

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

    void this.subscriberClientPromise
      .then(async (client) => {
        if (!client) return;
        subscriberClient = client;
        try {
          await client.subscribe(channel, redisHandler);
          subscribed = true;
          if (pendingUnsubscribe) {
            await client.unsubscribe(channel, redisHandler);
          }
        } catch (error) {
          logError("Notifications subscribe failed", {
            channel,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .catch((error) => {
        logError("Notifications subscriber connection failed", {
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      memoryUnsub();
      if (subscriberClient && subscribed) {
        void subscriberClient.unsubscribe(channel, redisHandler).catch((error) => {
          logError("Notifications unsubscribe failed", {
            channel,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return;
      }
      pendingUnsubscribe = true;
    };
  }

  private async createSubscriberClient() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return null;

    const client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy(retries) {
          return Math.min(retries * 100, 2000);
        },
      },
    });

    client.on("error", (error: unknown) => {
      logError("Redis subscriber error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    try {
      await client.connect();
      return client;
    } catch (error) {
      logError("Redis subscriber connection failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export const notificationsNotifier: NotificationNotifier = new RedisNotificationNotifier();
