import { EventEmitter } from "node:events";
import type { RedisClientType } from "redis";

import { getRedisConnection, getRedisSubscriberConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import type { NotificationEvent } from "@/lib/notifications/types";

const allowMemoryNotifierFallback = process.env.NODE_ENV !== "production";

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

  publish(userId: string, event: NotificationEvent): void {
    const channel = `notifications:${userId}`;
    const payload = JSON.stringify(event);

    void this.publisherClient.publish(channel, payload).catch((error) => {
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

    void this.subscriberClient.subscribe(channel, redisHandler).catch((error) => {
      logError("Notifications subscribe failed", {
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      void this.subscriberClient.unsubscribe(channel, redisHandler).catch((error) => {
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
      throw new Error("Redis is required for notifications notifier in production");
    }
    return new MemoryNotificationNotifier();
  }
  return new RedisNotificationNotifier(publisherClient, subscriberClient);
}

export const notificationsNotifier = createNotifier();
