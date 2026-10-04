import { NotificationType, ProviderType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (ops) — лента студии в приложении выбирает уведомления
 * условием Prisma, а веб-центр раскладывает их по каналам в памяти. Если два
 * правила разойдутся, приложение покажет студии чужие (личные, мастерские)
 * уведомления или «прочитать все» погасит личные. Тест прогоняет условие
 * мини-интерпретатором на всех сочетаниях записи и сверяет с классификатором
 * центра (`resolveModelChannel` → `STUDIO_*` → `classifyNotificationChannel`).
 */

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { classifyNotificationChannel, resolveModelChannel } from "./center";
import { studioChannelNotificationWhere } from "./studio-feed";

type Booking = {
  studioId: string | null;
  masterProviderId: string | null;
  masterProvider: { ownerUserId: string | null } | null;
  provider: { type: ProviderType; ownerUserId: string | null };
};

type NotificationRecord = {
  userId: string;
  deletedAt: Date | null;
  isRead: boolean;
  type: NotificationType;
  booking: Booking | null;
};

/** Мини-интерпретатор условий Prisma: равенство, null, in/notIn/not, AND/OR, `is`. SQL-семантика null. */
function matches(where: unknown, record: unknown): boolean {
  if (where === null || typeof where !== "object") return false;
  const rec = record as Record<string, unknown>;
  return Object.entries(where as Record<string, unknown>).every(([key, condition]) => {
    if (key === "AND") return (condition as unknown[]).every((part) => matches(part, record));
    if (key === "OR") return (condition as unknown[]).some((part) => matches(part, record));
    const value = rec[key];
    if (condition === null) return value === null || value === undefined;
    if (typeof condition !== "object" || condition instanceof Date) return value === condition;
    const ops = condition as Record<string, unknown>;
    if ("is" in ops) {
      if (value === null || value === undefined) return false;
      return matches(ops.is, value);
    }
    return Object.entries(ops).every(([op, operand]) => {
      if (value === null || value === undefined) return false;
      if (op === "in") return (operand as unknown[]).includes(value);
      if (op === "notIn") return !(operand as unknown[]).includes(value);
      if (op === "not") return value !== operand;
      throw new Error(`unsupported operator ${op}`);
    });
  });
}

const USER = "u1";
const STUDIO_IDS = ["s1"];

function webChannel(record: NotificationRecord) {
  return (
    resolveModelChannel(record.type) ??
    (record.type.startsWith("STUDIO_") ? "STUDIO" : null) ??
    classifyNotificationChannel({ userId: USER, studioIds: new Set(STUDIO_IDS), booking: record.booking })
  );
}

function allBookings(): Array<Booking | null> {
  const bookings: Array<Booking | null> = [null];
  const masterOwners: Array<string | null | "none"> = ["none", null, "u1", "u2"];
  for (const masterOwner of masterOwners) {
    for (const providerType of [ProviderType.MASTER, ProviderType.STUDIO]) {
      for (const providerOwner of [null, "u1", "u2"]) {
        for (const studioId of [null, "s1", "s2"]) {
          bookings.push({
            studioId,
            masterProviderId: masterOwner === "none" ? null : "mp",
            masterProvider: masterOwner === "none" ? null : { ownerUserId: masterOwner },
            provider: { type: providerType, ownerUserId: providerOwner },
          });
        }
      }
    }
  }
  return bookings;
}

const TYPES: NotificationType[] = [
  NotificationType.BOOKING_CREATED,
  NotificationType.BOOKING_RESCHEDULED,
  NotificationType.REVIEW_LEFT,
  NotificationType.CHAT_MESSAGE_RECEIVED,
  NotificationType.BILLING_PAYMENT_FAILED,
  NotificationType.STUDIO_INVITE_ACCEPTED,
  NotificationType.STUDIO_SCHEDULE_REQUEST,
  NotificationType.MODEL_NEW_APPLICATION,
  NotificationType.MODEL_TIME_PROPOSED,
];

describe("studioChannelNotificationWhere", () => {
  const where = studioChannelNotificationWhere({ userId: USER, studioIds: STUDIO_IDS });

  it("совпадает с каналом STUDIO веб-центра на всех сочетаниях записи", () => {
    let studioCount = 0;
    for (const type of TYPES) {
      for (const booking of allBookings()) {
        const record: NotificationRecord = { userId: USER, deletedAt: null, isRead: false, type, booking };
        const expected = webChannel(record) === "STUDIO";
        if (expected) studioCount += 1;
        expect({ type, booking, studio: matches(where, record) }).toEqual({ type, booking, studio: expected });
      }
    }
    // Проверка, что перебор не выродился: студийные уведомления в нём есть.
    expect(studioCount).toBeGreaterThan(20);
  });

  it("чужие и удалённые уведомления не попадают", () => {
    const booking: Booking = {
      studioId: "s1",
      masterProviderId: null,
      masterProvider: null,
      provider: { type: ProviderType.STUDIO, ownerUserId: "u2" },
    };
    const base = { isRead: false, type: NotificationType.BOOKING_CREATED, booking };
    expect(matches(where, { ...base, userId: USER, deletedAt: null })).toBe(true);
    expect(matches(where, { ...base, userId: "u2", deletedAt: null })).toBe(false);
    expect(matches(where, { ...base, userId: USER, deletedAt: new Date() })).toBe(false);
  });

  it("без студий остаются только STUDIO_* и записи студии, которой он владеет", () => {
    const none = studioChannelNotificationWhere({ userId: USER, studioIds: [] });
    const owned: Booking = {
      studioId: "s9",
      masterProviderId: null,
      masterProvider: null,
      provider: { type: ProviderType.STUDIO, ownerUserId: USER },
    };
    const member: Booking = { ...owned, studioId: "s1", provider: { type: ProviderType.STUDIO, ownerUserId: "u2" } };
    const record = (booking: Booking | null, type: NotificationType = NotificationType.BOOKING_CREATED) => ({
      userId: USER,
      deletedAt: null,
      isRead: false,
      type,
      booking,
    });
    expect(matches(none, record(owned))).toBe(true);
    expect(matches(none, record(member))).toBe(false);
    expect(matches(none, record(null, NotificationType.STUDIO_MEMBER_LEFT))).toBe(true);
  });
});
