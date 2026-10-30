import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSendJob, Job } from "@/lib/queue/types";

const mocks = vi.hoisted(() => ({
  trySendEmail: vi.fn(),
  isEmailConfigured: vi.fn(() => true),
  notificationFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  enqueue: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("@/lib/email/sender", () => ({
  trySendEmail: mocks.trySendEmail,
  isEmailConfigured: mocks.isEmailConfigured,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { findUnique: mocks.notificationFindUnique },
    userProfile: { findUnique: mocks.userFindUnique },
  },
}));
vi.mock("@/lib/queue/queue", () => ({ enqueue: mocks.enqueue }));
vi.mock("@/lib/logging/logger", () => ({ logError: mocks.logError, logInfo: mocks.logInfo }));
vi.mock("@/lib/app-url", () => ({ resolvePublicAppUrl: () => "https://masterryadom.ru" }));

import {
  enqueueEmailNotification,
  processEmailSendPayload,
  runEmailSendJob,
} from "@/lib/notifications/email-send";
import { retryDelaysFor } from "@/lib/queue/retry-policy";
import { createEmailSendJob, isJob } from "@/lib/queue/types";

const RECIPIENT = { email: "client@example.ru", emailNotificationsEnabled: true, emailVerifiedAt: new Date() };
const NOTIFICATION = {
  title: "Новая запись",
  body: "Анна Соколова записала Елену Петрову на маникюр завтра в 10:00",
  user: RECIPIENT,
};

function smtpError(fields: { code?: string; responseCode?: number }) {
  return Object.assign(new Error("smtp"), fields);
}

function emailJob(attempts = 0): EmailSendJob {
  return createEmailSendJob(
    { notificationId: "ntf-1", type: "BOOKING_CREATED", link: "https://masterryadom.ru/cabinet/bookings" },
    { attempts },
  );
}

function loggedErrors(): string[] {
  return mocks.logError.mock.calls.map((call) => call[0] as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.notificationFindUnique.mockResolvedValue(NOTIFICATION);
  mocks.userFindUnique.mockResolvedValue(RECIPIENT);
  mocks.trySendEmail.mockResolvedValue({ status: "sent" });
  mocks.enqueue.mockResolvedValue(undefined);
});

/**
 * NOTIFICATION-EMAIL-QUEUE (A-06) — письмо-уведомление задачей очереди.
 *
 * @probe Положил в payload `title`/`body` уведомления — краснеет «в задаче
 * нет ни адреса, ни текста…»: «expected [ 'body', 'link', …(3) ] to deeply
 * equal [ 'link', 'notificationId', 'type' ]». Поставил в `runEmailSendJob`
 * повтор на любой исход, кроме «sent» — краснеет «5xx — задача закрыта
 * сразу…»: «expected "vi.fn()" to not be called at all, but actually been
 * called 1 times». Убрал запасную отправку при недоступной очереди — краснеет
 * «очередь недоступна — письмо уходит сразу…»: «expected "vi.fn()" to be
 * called 1 times, but got 0 times». Вернул в `deliverExternalChannels` прямой
 * `void deliverEmailNotification(…)` — краснеет сторож «delivery.ts ставит
 * письмо в очередь…»: «expected 'import type { NotificationType, Prism…' to
 * match /enqueueEmailNotification\(/». Заменил в воркере `retry: enqueueRetry`
 * на пустую функцию — краснеет «воркер отдаёт задачу email.send…»: «expected
 * 'import \'dotenv/config\';…' to match /await runEmailSendJob\(job, \{ retry:…/».
 */
describe("NOTIFICATION-EMAIL-QUEUE — постановка", () => {
  it("в задаче нет ни адреса, ни текста — только id уведомления, тип и ссылка без id", async () => {
    await enqueueEmailNotification({
      notificationId: "ntf-1",
      userId: "u1",
      type: "BOOKING_CREATED",
      url: "/cabinet/bookings?focus=cmg1abcdefghijklmnopqrstu",
    });

    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    const job = mocks.enqueue.mock.calls[0]![0] as Job;
    expect(job.type).toBe("email.send");
    expect(Object.keys(job.payload).sort()).toEqual(["link", "notificationId", "type"]);
    expect(job.payload).toEqual({
      notificationId: "ntf-1",
      type: "BOOKING_CREATED",
      link: "https://masterryadom.ru/cabinet/bookings",
    });
    const serialized = JSON.stringify(job);
    expect(serialized).not.toContain("client@example.ru");
    expect(serialized).not.toContain("Соколова");
    expect(isJob(JSON.parse(serialized))).toBe(true);
    // Отправки в процессе запроса нет.
    expect(mocks.trySendEmail).not.toHaveBeenCalled();
  });

  it("почта не подтверждена или выключена — задача не ставится", async () => {
    mocks.userFindUnique.mockResolvedValue({ ...RECIPIENT, emailVerifiedAt: null });
    await enqueueEmailNotification({ notificationId: "ntf-1", userId: "u1", type: "BOOKING_CREATED" });
    mocks.userFindUnique.mockResolvedValue({ ...RECIPIENT, emailNotificationsEnabled: false });
    await enqueueEmailNotification({ notificationId: "ntf-1", userId: "u1", type: "BOOKING_CREATED" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("очередь недоступна — письмо уходит сразу, как до очереди", async () => {
    mocks.enqueue.mockRejectedValue(Object.assign(new Error("Redis command timed out"), { code: "REDIS_COMMAND_TIMEOUT" }));
    await enqueueEmailNotification({ notificationId: "ntf-1", userId: "u1", type: "BOOKING_CREATED" });
    expect(mocks.trySendEmail).toHaveBeenCalledTimes(1);
  });

  it("delivery.ts ставит письмо в очередь, а не отправляет из процесса запроса", () => {
    const delivery = readFileSync(resolve(process.cwd(), "src/lib/notifications/delivery.ts"), "utf8");
    expect(delivery).toMatch(/enqueueEmailNotification\(/);
    expect(delivery).not.toMatch(/\b(sendEmail|trySendEmail|deliverEmailNotification)\(/);
  });
});

describe("NOTIFICATION-EMAIL-QUEUE — отправка воркером", () => {
  it("текст и адрес перечитываются из базы в момент отправки", async () => {
    const outcome = await processEmailSendPayload(emailJob().payload);
    expect(outcome).toEqual({ kind: "sent" });
    const mail = mocks.trySendEmail.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(mail.to).toBe("client@example.ru");
    expect(mail.subject).toBe("Новая запись");
    expect(mail.html).toContain('href="https://masterryadom.ru/cabinet/bookings"');
  });

  it("получатель выключил почту после постановки — письма нет", async () => {
    mocks.notificationFindUnique.mockResolvedValue({ ...NOTIFICATION, user: { ...RECIPIENT, emailVerifiedAt: null } });
    expect(await processEmailSendPayload(emailJob().payload)).toEqual({ kind: "skipped", reason: "recipient" });
    expect(mocks.trySendEmail).not.toHaveBeenCalled();
  });

  it("уведомления нет (аккаунт удалён) — письма нет", async () => {
    mocks.notificationFindUnique.mockResolvedValue(null);
    expect(await processEmailSendPayload(emailJob().payload)).toEqual({
      kind: "skipped",
      reason: "notification-missing",
    });
    expect(mocks.trySendEmail).not.toHaveBeenCalled();
  });

  it("временный отказ (451, обрыв соединения) — повтор по таблице типа", async () => {
    for (const error of [smtpError({ code: "EENVELOPE", responseCode: 451 }), smtpError({ code: "ECONNECTION" })]) {
      mocks.trySendEmail.mockResolvedValueOnce({ status: "failed", error });
      const retry = vi.fn().mockResolvedValue(undefined);
      await runEmailSendJob(emailJob(0), { retry });
      expect(retry).toHaveBeenCalledTimes(1);
      const [retried, delayMs] = retry.mock.calls[0]!;
      expect(retried.attempts).toBe(1);
      expect(delayMs).toBe(retryDelaysFor("email.send")[0]);
    }
    // Временный отказ — без алерта: алерт будет, если повторы кончатся.
    expect(loggedErrors()).not.toContain("Email notification delivery failed");
  });

  it("5xx — задача закрыта сразу, без повтора", async () => {
    mocks.trySendEmail.mockResolvedValue({
      status: "failed",
      error: smtpError({ code: "EENVELOPE", responseCode: 550 }),
    });
    const retry = vi.fn().mockResolvedValue(undefined);
    await runEmailSendJob(emailJob(0), { retry });
    expect(retry).not.toHaveBeenCalled();
    expect(loggedErrors()).toContain("Email notification delivery failed");
  });

  it("повторы кончились — строка ошибки, задача закрыта, в мёртвые не идёт", async () => {
    mocks.trySendEmail.mockResolvedValue({ status: "failed", error: smtpError({ code: "ETIMEDOUT" }) });
    const retry = vi.fn().mockResolvedValue(undefined);
    await runEmailSendJob(emailJob(retryDelaysFor("email.send").length), { retry });
    expect(retry).not.toHaveBeenCalled();
    const call = mocks.logError.mock.calls.find((c) => c[0] === "Email notification delivery failed");
    expect(call?.[1]).toMatchObject({ reason: "retries-exhausted", notificationId: "ntf-1", code: "ETIMEDOUT" });
  });

  it("в лог не уходят ни адрес, ни текст ответа сервера", async () => {
    mocks.trySendEmail.mockResolvedValue({
      status: "failed",
      error: Object.assign(new Error("550 5.1.1 <client@example.ru>: Recipient address rejected"), {
        code: "EENVELOPE",
        responseCode: 550,
      }),
    });
    await runEmailSendJob(emailJob(0), { retry: vi.fn() });
    const logged = JSON.stringify([...mocks.logError.mock.calls, ...mocks.logInfo.mock.calls]);
    expect(logged).not.toContain("client@example.ru");
    expect(logged).not.toContain("Соколова");
  });

  it("повторы письма — около часа", () => {
    const total = retryDelaysFor("email.send").reduce((acc, ms) => acc + ms, 0);
    expect(total).toBeGreaterThanOrEqual(45 * 60_000);
    expect(total).toBeLessThanOrEqual(90 * 60_000);
  });

  it("воркер отдаёт задачу email.send в runEmailSendJob с постановкой повтора", () => {
    const worker = readFileSync(resolve(process.cwd(), "src/worker.ts"), "utf8");
    expect(worker).toMatch(/job\.type === EMAIL_SEND_JOB_TYPE\)\s*\{\s*await processEmailSend\(job\);/);
    expect(worker).toMatch(/await runEmailSendJob\(job, \{ retry: enqueueRetry \}\);/);
  });
});
