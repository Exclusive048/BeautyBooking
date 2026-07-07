import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HARDENING-09 #13 — the live Telegram reminder path renders the booking time in
 * the SALON timezone with a zone label (was raw-UTC, masked by the kill-switch).
 * Mocks the DB/queue/recipient boundary and asserts the enqueued reminder text,
 * using the SAME salon-tz formatter as the in-app lifecycle path (real, not
 * mocked) so a format regression here would fail both.
 */

const bookingFindUnique = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const getTelegramChatIdForUser = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findUnique: bookingFindUnique } } }));
vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/queue/types", () => ({
  createTelegramSendJob: (payload: { chatId: string; text: string }) => ({
    type: "telegram.send",
    payload,
  }),
}));
vi.mock("@/lib/notifications/recipients", () => ({ getTelegramChatIdForUser }));
vi.mock("@/lib/telegram/config", () => ({ getAppPublicUrl: () => "https://example.test" }));
vi.mock("@/lib/logging/logger", () => ({ logError }));

import { sendBookingReminderTelegramNotifications } from "./bookingTelegramService";

function bookingRow(timezone: string) {
  return {
    id: "bk-1",
    startAtUtc: new Date("2026-07-07T08:00:00Z"),
    slotLabel: null,
    clientName: "Елена",
    clientPhone: "+79995000000",
    clientUserId: "client-1",
    service: { name: "Маникюр" },
    provider: { name: "Vision", ownerUserId: "master-1", timezone },
    masterProvider: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getTelegramChatIdForUser.mockImplementation(async (userId: string) => `chat-${userId}`);
});

describe("sendBookingReminderTelegramNotifications — salon-tz", () => {
  it("Vision (Yekaterinburg, GMT+5): reminder text shows 13:00 + zone label, not raw 08:00", async () => {
    bookingFindUnique.mockResolvedValue(bookingRow("Asia/Yekaterinburg"));

    await sendBookingReminderTelegramNotifications("bk-1", "REMINDER_2H");

    // master + client both have a chat id → two enqueued reminders, same time text
    expect(enqueue).toHaveBeenCalledTimes(2);
    const text = enqueue.mock.calls[0][0].payload.text as string;
    expect(text).toContain("Когда: 07.07, 13:00");
    expect(text).toContain("GMT+5");
    expect(text).toContain("Екатеринбург");
    expect(text).not.toContain("08:00");
    expect(text).toContain("⏰ Напоминание за 2 часа");
  });

  it("Moscow control (Anna Sokolova, GMT+3): reminder shows 11:00 — no UTC-vs-salon regression", async () => {
    bookingFindUnique.mockResolvedValue(bookingRow("Europe/Moscow"));

    await sendBookingReminderTelegramNotifications("bk-1", "REMINDER_24H");

    const text = enqueue.mock.calls[0][0].payload.text as string;
    expect(text).toContain("Когда: 07.07, 11:00");
    expect(text).toContain("GMT+3");
    expect(text).toContain("Москва");
    expect(text).toContain("⏰ Напоминание за 24 часа");
  });

  it("no booking → no enqueue (graceful)", async () => {
    bookingFindUnique.mockResolvedValue(null);
    await sendBookingReminderTelegramNotifications("missing", "REMINDER_2H");
    expect(enqueue).not.toHaveBeenCalled();
  });
});
