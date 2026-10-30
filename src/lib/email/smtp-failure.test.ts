import { describe, expect, it } from "vitest";
import { describeSmtpFailure } from "@/lib/email/smtp-failure";

/** Ошибка формы nodemailer: `code`, `responseCode`, `command`, `response`. */
function smtpError(fields: { code?: string; responseCode?: number; command?: string; response?: string }) {
  return Object.assign(new Error(fields.response ?? "smtp failed"), fields);
}

/**
 * NOTIFICATION-EMAIL-QUEUE (A-06) — какой отказ SMTP повторять.
 *
 * @probe Поменял границу на `responseCode < 600` (всё с кодом ответа —
 * временное) — краснеют «5xx — постоянный …»: «EENVELOPE 550: expected true
 * to be false» и «ответ сервера с адресом…»: «expected { transient: true, …(3)
 * } to deeply equal { transient: false, …(3) }».
 * Убрал `ETIMEDOUT` из списка временных — краснеет «сеть и таймауты —
 * временные»: «ETIMEDOUT: expected false to be true».
 */
describe("describeSmtpFailure", () => {
  it("4xx — временный: лимит отправки, «попробуйте позже», сервис недоступен", () => {
    for (const responseCode of [421, 450, 451, 452, 454]) {
      expect(describeSmtpFailure(smtpError({ code: "EENVELOPE", responseCode })).transient, String(responseCode)).toBe(
        true,
      );
    }
  });

  it("5xx — постоянный: адреса нет, ящик закрыт, неверный логин", () => {
    for (const [code, responseCode] of [
      ["EENVELOPE", 550],
      ["EENVELOPE", 553],
      ["EMESSAGE", 554],
      ["EAUTH", 535],
    ] as const) {
      expect(describeSmtpFailure(smtpError({ code, responseCode })).transient, `${code} ${responseCode}`).toBe(false);
    }
  });

  it("сеть и таймауты без ответа сервера — временные", () => {
    for (const code of ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"]) {
      expect(describeSmtpFailure(smtpError({ code })).transient, code).toBe(true);
    }
  });

  it("без кода и без ответа сервера — постоянный: повторяется только то, что пройдёт само", () => {
    expect(describeSmtpFailure(new Error("boom")).transient).toBe(false);
    expect(describeSmtpFailure(smtpError({ code: "EAUTH" })).transient).toBe(false);
    expect(describeSmtpFailure("строка").transient).toBe(false);
    expect(describeSmtpFailure(null).transient).toBe(false);
  });

  it("ответ сервера с адресом получателя в результат не попадает", () => {
    const failure = describeSmtpFailure(
      smtpError({
        code: "EENVELOPE",
        responseCode: 550,
        command: "RCPT TO",
        response: "550 5.1.1 <victim@example.ru>: Recipient address rejected",
      }),
    );
    expect(failure).toEqual({ transient: false, code: "EENVELOPE", responseCode: 550, command: "RCPT TO" });
    expect(JSON.stringify(failure)).not.toContain("victim");
  });
});
