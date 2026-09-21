import { describe, expect, it, vi } from "vitest";

/**
 * EMAIL-DELIVERABILITY-01 — транспорт письма.
 *
 * (1) EHLO: без явного `name` nodemailer представляется `os.hostname()`, а в
 * контейнере это случайный id, который уезжает в заголовок `Received` каждого
 * письма. Транспорт обязан представляться хостом публичного адреса.
 *
 * (2) `headers` из `sendEmail` обязаны доезжать до `sendMail` — иначе
 * `List-Unsubscribe` уведомлений собирается и молча теряется.
 *
 * @probe 2026-09-22 — (а) удалён `...(name ? { name } : {})` из
 * `buildTransporter`: красный «транспорт представляется хостом приложения»
 * (`expected { host: 'smtp.test', port: 465, …(5) } to match object { name: 'masterryadom.ru' }`);
 * (б) удалён `headers: opts.headers` из `sendMail`: красный «заголовки
 * доезжают до sendMail» (`expected "vi.fn()" to be called with arguments:
 * [ ObjectContaining{…} ]`). Оба возвращены — зелёные.
 */

const sendMail = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const createTransport = vi.hoisted(() =>
  vi.fn<(options: Record<string, unknown>) => { sendMail: typeof sendMail }>(() => ({ sendMail }))
);

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("@/lib/env", () => ({
  env: {
    SMTP_HOST: "smtp.test",
    SMTP_PORT: 465,
    SMTP_USER: "user@test",
    SMTP_PASS: "secret",
    SMTP_FROM: "from@test",
    NEXT_PUBLIC_APP_URL: "https://masterryadom.ru/",
  },
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { resolveSmtpClientName, sendEmail } from "@/lib/email/sender";

describe("EMAIL-DELIVERABILITY-01 · SMTP-транспорт", () => {
  it("имя клиента — хост публичного адреса приложения", () => {
    expect(resolveSmtpClientName()).toBe("masterryadom.ru");
  });

  it("транспорт представляется хостом приложения", async () => {
    await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
    expect(createTransport.mock.calls[0]?.[0]).toMatchObject({ name: "masterryadom.ru" });
  });

  it("заголовки доезжают до sendMail", async () => {
    sendMail.mockClear();
    await sendEmail({
      to: "a@b.test",
      subject: "s",
      html: "<p>x</p>",
      headers: { "List-Unsubscribe": "<https://masterryadom.ru/cabinet/settings>" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "List-Unsubscribe": "<https://masterryadom.ru/cabinet/settings>" },
      })
    );
  });
});
