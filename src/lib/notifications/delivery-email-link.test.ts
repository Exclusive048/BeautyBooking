import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EXTERNAL-LINK-NO-IDS — кнопка письма-уведомления ведёт в раздел, а не на
 * запись: внутренний id не уходит ни в HTML, ни в текстовую часть письма.
 *
 * @probe 2026-10-02 (выполнена): в `deliverEmailNotification` возвращена
 * прежняя сборка ссылки (`${baseUrl}${ctaUrl}`) → 2 красных: «HTML и текст
 * письма — без id записи», «ссылка с id в пути — письмо без кнопки».
 */

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn<(opts: { html: string; text: string }) => Promise<boolean>>(async () => true),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn(), publishNotifications: vi.fn() }));
vi.mock("@/lib/legal/consent", () => ({ filterUsersWithMarketingConsent: vi.fn() }));
vi.mock("@/lib/notifications/push/send", () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/recipients", () => ({ getTelegramChatIdForUser: vi.fn() }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: vi.fn() }));
vi.mock("@/lib/vk/notify", () => ({ enqueueVkNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/sender", () => ({ sendEmail: mocks.sendEmail, isEmailConfigured: () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: { userProfile: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ resolvePublicAppUrl: () => "https://masterryadom.ru" }));

import { deliverExternalChannels } from "@/lib/notifications/delivery";

const ID = "cmg1abcdefghijklmnopqrstu";
const RECORD = { userId: "u1", type: "BOOKING_CREATED" as const, title: "Новая запись", body: "Завтра в 10:00" };

async function sentMail() {
  await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(1));
  return mocks.sendEmail.mock.calls[0]![0];
}

beforeEach(() => {
  mocks.sendEmail.mockClear();
  mocks.findUnique.mockResolvedValue({
    email: "a@b.ru",
    emailNotificationsEnabled: true,
    emailVerifiedAt: new Date(),
  });
});

describe("письмо-уведомление — без внутренних id", () => {
  it("HTML и текст письма — без id записи, кнопка ведёт в раздел", async () => {
    deliverExternalChannels(RECORD, { pushUrl: `/cabinet/bookings?focus=${ID}` });
    const mail = await sentMail();
    expect(mail.html).not.toContain(ID);
    expect(mail.text).not.toContain(ID);
    expect(mail.html).toContain('href="https://masterryadom.ru/cabinet/bookings"');
  });

  it("ссылка с id в пути — письмо без кнопки", async () => {
    deliverExternalChannels(RECORD, { emailCtaUrl: `/cabinet/bookings/${ID}` });
    const mail = await sentMail();
    expect(mail.html).not.toContain(ID);
    expect(mail.text).not.toContain(ID);
  });
});
