import { createServer, type Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import nodemailer from "nodemailer";
import { SMTP_TIMEOUTS } from "@/lib/email/sender";

/**
 * GUARD-INTEGRITY — поведенческая половина сторожа RES-05.
 *
 * Соседний `smtp-timeouts.test.ts` доказывает, что константы ДОХОДЯТ до
 * nodemailer (снятие `...SMTP_TIMEOUTS` его роняет) — это звучно. Чего он не
 * доказывал: что значения вообще что-то ограничивают. Его единственная
 * проверка величины была `<= 60_000`, а это на единственном включённом в проде
 * канале входа не граница, а формальность: `socketTimeout: 59_000` проходил бы
 * зелёным, оставляя пользователя с крутящейся кнопкой на минуту.
 *
 * Здесь проверяется само поведение: сервер, который принимает соединение и
 * МОЛЧИТ (ровно так выглядит зависший SMTP-хост — это не отказ, отказ пришёл
 * бы мгновенно), и отправка обязана отклониться внутри дедлайна.
 *
 * @probe   что сломать: `greetingTimeout: 5_000` → `59_000` в `lib/email/sender.ts`
 *          (значение, которое проходило прежнюю границу `<= 60_000`)
 *          наблюдалось: оба теста красные («отправка висела 10024 мс»),
 *          при этом соседний `smtp-timeouts.test.ts` остался **4/4 зелёным**
 *          — именно это и есть закрываемая дыра.
 *
 * ⚠️ nodemailer здесь НЕ замокан намеренно: мок доказал бы только то, что мы
 * передали числа, а предмет проверки — что они срабатывают.
 */

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer(() => {
    // Соединение принято, приветствие SMTP (220) НЕ отправляется никогда.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("RES-05 · дедлайн SMTP срабатывает, а не просто объявлен", () => {
  it("молчащий хост отклоняет отправку внутри границы приветствия", async () => {
    const transporter = nodemailer.createTransport({
      host: "127.0.0.1",
      port,
      secure: false,
      ...SMTP_TIMEOUTS,
    });

    const startedAt = Date.now();
    await expect(
      transporter.sendMail({ from: "a@test", to: "b@test", subject: "s", text: "t" }),
    ).rejects.toThrow();
    const elapsed = Date.now() - startedAt;

    // Верхняя граница — заявленная плюс запас на планировщик.
    expect(
      elapsed,
      `отправка висела ${elapsed} мс при greetingTimeout=${SMTP_TIMEOUTS.greetingTimeout}`,
    ).toBeLessThan(SMTP_TIMEOUTS.greetingTimeout + 3_000);

    // Нижняя граница — не менее половины дедлайна: иначе тест был бы зелёным и
    // от мгновенного ECONNREFUSED, то есть не проверял бы таймаут вовсе.
    expect(elapsed, "отказ пришёл слишком быстро — это не таймаут").toBeGreaterThan(
      SMTP_TIMEOUTS.greetingTimeout / 2,
    );
  }, 30_000);

  it("границы соразмерны горячему пути входа, а не «меньше минуты»", () => {
    // Прежний потолок `<= 60_000` пропускал 59 секунд на единственном живом
    // канале входа. Планка выведена из UX: пользователь ждёт ответа формы.
    expect(SMTP_TIMEOUTS.connectionTimeout).toBeLessThanOrEqual(10_000);
    expect(SMTP_TIMEOUTS.greetingTimeout).toBeLessThanOrEqual(10_000);
    expect(SMTP_TIMEOUTS.socketTimeout).toBeLessThanOrEqual(15_000);
  });
});
