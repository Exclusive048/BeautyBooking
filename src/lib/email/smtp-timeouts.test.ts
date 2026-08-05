import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * RES-05 — у SMTP-сессии не было верхних границ ни в одном из трёх
 * транспортов проекта.
 *
 * Дефолты nodemailer: connect 2 мин, greeting 30 с, **socket 10 мин**. Отправка
 * стоит в горячем пути входа (`await sendEmail` держит ответ, UI переключает
 * шаг на ввод кода только по нему), а в проде phone-OTP выключен tri-state'ом
 * — то есть email это единственный рабочий канал входа. Зависший SMTP означал
 * не «письмо придёт позже», а «войти нельзя», с крутящейся кнопкой до десяти
 * минут.
 *
 * Проверяется то, что реально ломалось: значения существуют, они осмысленны,
 * и их ОДИН набор — иначе через полгода в support-роутах окажется своя копия,
 * разошедшаяся с каноном.
 */

const createTransport = vi.hoisted(() =>
  vi.fn((_options: Record<string, unknown>) => ({ sendMail: vi.fn(), verify: vi.fn() }))
);

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("@/lib/env", () => ({
  env: {
    SMTP_HOST: "smtp.test",
    SMTP_PORT: 587,
    SMTP_USER: "user@test",
    SMTP_PASS: "secret",
    SMTP_FROM: "from@test",
  },
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { SMTP_TIMEOUTS, sendEmail } from "@/lib/email/sender";

const SRC_ROOT = resolve(process.cwd(), "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

describe("RES-05 · SMTP-транспорты ограничены сверху", () => {
  it("границы заданы и не превышают минуты", () => {
    expect(SMTP_TIMEOUTS.connectionTimeout).toBeGreaterThan(0);
    expect(SMTP_TIMEOUTS.greetingTimeout).toBeGreaterThan(0);
    expect(SMTP_TIMEOUTS.socketTimeout).toBeGreaterThan(0);
    for (const value of Object.values(SMTP_TIMEOUTS)) {
      expect(value).toBeLessThanOrEqual(60_000);
    }
  });

  it("транспорт входа создаётся с этими границами", async () => {
    createTransport.mockClear();
    await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport.mock.calls[0]?.[0]).toMatchObject(SMTP_TIMEOUTS);
  });

  it("каждый createTransport в дереве берёт границы из общего источника", () => {
    // Три транспорта: `lib/email/sender.ts` и два support-роута, строящие свой
    // из нормализованных значений. Копия значений в любом из них — это
    // расхождение, которое замечают только на инциденте.
    const offenders = walk(SRC_ROOT)
      .filter((file) => /nodemailer\.createTransport\(/.test(readFileSync(file, "utf8")))
      .filter((file) => !/\.\.\.SMTP_TIMEOUTS/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("verify() не стоит в горячем пути support-роутов", () => {
    // Полный второй SMTP-сеанс перед каждой отправкой удваивал ожидание, а
    // диагностику давал ту же, что и сам `sendMail`.
    for (const file of [
      resolve(SRC_ROOT, "app/api/support/tickets/route.ts"),
      resolve(SRC_ROOT, "app/api/support/partnership/route.ts"),
    ]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/await\s+transporter\.verify\(\)/);
    }
  });
});
