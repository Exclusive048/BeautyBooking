import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSendPayload, Job } from "@/lib/queue/types";

/**
 * EXTERNAL-LINK-NO-IDS — кнопка письма-уведомления ведёт в раздел, а не на
 * запись: внутренний id не уходит ни в задачу очереди, ни в HTML, ни в
 * текстовую часть письма. С NOTIFICATION-EMAIL-QUEUE письмо собирает воркер
 * (`email-send.ts`), поэтому путь проверяется целиком: `deliverExternalChannels`
 * → задача `email.send` → письмо.
 *
 * @probe 2026-10-02 (выполнена): в `deliverEmailNotification` возвращена
 * прежняя сборка ссылки (`${baseUrl}${ctaUrl}`) → 2 красных: «HTML и текст
 * письма — без id записи», «ссылка с id в пути — письмо без кнопки».
 * @probe 2026-10-30 (выполнена, NOTIFICATION-EMAIL-QUEUE): в
 * `enqueueEmailNotification` в задачу положен сырой `input.url` → 2 красных:
 * «HTML и текст письма — без id записи» («expected '{"id":"c357188e-…' not to
 * contain 'cmg1abcdefghijklmnopqrstu'») и «ссылка с id в пути — письмо без
 * кнопки» («expected '/cabinet/bookings/cmg1abcdefghijklmno…' to be null»).
 */

const mocks = vi.hoisted(() => ({
  trySendEmail: vi.fn<(opts: { html: string; text: string }) => Promise<{ status: "sent" }>>(async () => ({
    status: "sent",
  })),
  userFindUnique: vi.fn(),
  notificationFindUnique: vi.fn(),
  enqueue: vi.fn<(job: Job) => Promise<void>>(async () => undefined),
}));

vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn(), publishNotifications: vi.fn() }));
vi.mock("@/lib/legal/consent", () => ({ filterUsersWithMarketingConsent: vi.fn() }));
vi.mock("@/lib/notifications/push/send", () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/recipients", () => ({ getTelegramChatIdForUser: vi.fn() }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: mocks.enqueue }));
vi.mock("@/lib/vk/notify", () => ({ enqueueVkNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/sender", () => ({ trySendEmail: mocks.trySendEmail, isEmailConfigured: () => true }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { findUnique: mocks.userFindUnique },
    notification: { findUnique: mocks.notificationFindUnique },
  },
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ resolvePublicAppUrl: () => "https://masterryadom.ru" }));

import { deliverExternalChannels } from "@/lib/notifications/delivery";
import { processEmailSendPayload } from "@/lib/notifications/email-send";

const ID = "cmg1abcdefghijklmnopqrstu";
const RECORD = { id: "ntf-1", userId: "u1", type: "BOOKING_CREATED" as const, title: "Новая запись", body: "Завтра в 10:00" };
const RECIPIENT = { email: "a@b.ru", emailNotificationsEnabled: true, emailVerifiedAt: new Date() };

/** Задача, которую поставил `deliverExternalChannels`, и письмо, которое из неё соберёт воркер. */
async function queuedThenSent() {
  await vi.waitFor(() => expect(mocks.enqueue).toHaveBeenCalledTimes(1));
  const job = mocks.enqueue.mock.calls[0]![0];
  expect(job.type).toBe("email.send");
  await processEmailSendPayload(job.payload as EmailSendPayload);
  return { job, mail: mocks.trySendEmail.mock.calls[0]![0] };
}

beforeEach(() => {
  mocks.trySendEmail.mockClear();
  mocks.enqueue.mockClear();
  mocks.userFindUnique.mockResolvedValue(RECIPIENT);
  mocks.notificationFindUnique.mockResolvedValue({ title: RECORD.title, body: RECORD.body, user: RECIPIENT });
});

describe("письмо-уведомление — без внутренних id", () => {
  it("HTML и текст письма — без id записи, кнопка ведёт в раздел", async () => {
    deliverExternalChannels(RECORD, { pushUrl: `/cabinet/bookings?focus=${ID}` });
    const { job, mail } = await queuedThenSent();
    expect(JSON.stringify(job)).not.toContain(ID);
    expect(mail.html).not.toContain(ID);
    expect(mail.text).not.toContain(ID);
    expect(mail.html).toContain('href="https://masterryadom.ru/cabinet/bookings"');
  });

  it("ссылка с id в пути — письмо без кнопки", async () => {
    deliverExternalChannels(RECORD, { emailCtaUrl: `/cabinet/bookings/${ID}` });
    const { job, mail } = await queuedThenSent();
    expect((job.payload as EmailSendPayload).link).toBeNull();
    expect(mail.html).not.toContain(ID);
    expect(mail.text).not.toContain(ID);
  });
});
