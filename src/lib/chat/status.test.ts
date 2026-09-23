import { describe, it, expect } from "vitest";
import {
  getChatAvailability,
  isBookingChatOpen,
  isChatOpen,
  OPEN_STATUSES,
  READONLY_WINDOW_HOURS,
} from "@/lib/chat/status";

describe("chat/status", () => {
  it("detects open statuses", () => {
    expect(isChatOpen(OPEN_STATUSES[0] as never)).toBe(true);
    expect(isChatOpen("CANCELLED" as never)).toBe(false);
  });

  // CHAT-BEFORE-CONFIRM-01 · @probe 2026-09-23 — из OPEN_STATUSES убраны
  // PENDING и CHANGE_REQUESTED (прежний набор): красный этот кейс. Возвращено —
  // зелёный.
  it("чат открыт до подтверждения мастером и пока согласуется перенос", () => {
    for (const status of ["NEW", "PENDING", "CHANGE_REQUESTED"] as const) {
      const result = getChatAvailability(status as never, new Date());
      expect(result.canSend, status).toBe(true);
      expect(result.isAvailable, status).toBe(true);
    }
    for (const status of ["REJECTED", "CANCELLED", "NO_SHOW"] as const) {
      expect(isChatOpen(status as never), status).toBe(false);
    }
  });

  // @probe 2026-09-23 — в `isBookingChatOpen` снято окно для неподтверждённых
  // (всегда `true` при открытом статусе): красный этот кейс. Возвращено — зелёный.
  it("неподтверждённая запись, чьё время прошло больше суток назад, чат закрывает", () => {
    const hour = 60 * 60 * 1000;
    const stale = new Date(Date.now() - (READONLY_WINDOW_HOURS + 1) * hour);
    const recent = new Date(Date.now() - hour);
    for (const status of ["NEW", "PENDING", "CHANGE_REQUESTED"] as const) {
      const result = getChatAvailability(status as never, stale);
      expect(result.canSend, status).toBe(false);
      // переписка остаётся видна
      expect(result.isAvailable, status).toBe(true);
      expect(isBookingChatOpen({ status: status as never, startAtUtc: recent }), status).toBe(true);
    }
    // подтверждённую после визита закрывает финализатор (FINISHED), не это окно
    expect(isBookingChatOpen({ status: "CONFIRMED" as never, startAtUtc: stale })).toBe(true);
  });

  it("returns read-only availability within window for finished bookings", () => {
    const startAt = new Date(Date.now() - (READONLY_WINDOW_HOURS - 1) * 60 * 60 * 1000);
    const result = getChatAvailability("FINISHED" as never, startAt);
    expect(result.canSend).toBe(false);
    expect(result.isReadOnly).toBe(true);
    expect(result.isAvailable).toBe(true);
  });

  it("closes finished chats beyond read-only window", () => {
    const startAt = new Date(Date.now() - (READONLY_WINDOW_HOURS + 1) * 60 * 60 * 1000);
    const result = getChatAvailability("FINISHED" as never, startAt);
    expect(result.isReadOnly).toBe(false);
    expect(result.isAvailable).toBe(true);
  });
});
