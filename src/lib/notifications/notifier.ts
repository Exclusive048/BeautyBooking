import { EventEmitter } from "node:events";
import type { NotificationType, Prisma } from "@prisma/client";

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

type GlobalNotifier = typeof globalThis & {
  __bhNotificationNotifier?: NotificationNotifier;
};

const globalForNotifier = globalThis as GlobalNotifier;

export const notificationsNotifier: NotificationNotifier =
  globalForNotifier.__bhNotificationNotifier ?? new MemoryNotificationNotifier();

if (!globalForNotifier.__bhNotificationNotifier) {
  globalForNotifier.__bhNotificationNotifier = notificationsNotifier;
}
