import { getChatAvailability, isChatOpen, OPEN_STATUSES, READONLY_WINDOW_HOURS } from "@/lib/chat/status";

describe("chat/status", () => {
  it("detects open statuses", () => {
    expect(isChatOpen(OPEN_STATUSES[0] as never)).toBe(true);
    expect(isChatOpen("CANCELLED" as never)).toBe(false);
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
