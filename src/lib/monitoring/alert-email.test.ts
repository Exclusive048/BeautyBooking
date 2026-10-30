import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ALERT-EMAIL-CHANNEL — ops-алерт ещё и письмом на ящик команды.
 *
 * Два утверждения, и оба — про поведение, а не про форму кода:
 *   1. Письмо получает ровно то, что Telegram: разрешённые и очищенные поля
 *      (ALERT-CONTEXT-ALLOWLIST). Тест гонит НАСТОЯЩИЕ `logError` → паузу
 *      `alert-cooldown.ts` → `sendAlert` и смотрит в аргументы отправки
 *      письма — туда, куда уходит утечка.
 *   2. Писем не больше потолка на все процессы вместе: SMTP-ящик общий с
 *      кодами входа, и шторм писем выбрал бы его суточный предел. Предупреждения
 *      берут только часть, отказ места не тратит, последнее письмо говорит о
 *      потолке.
 * Подменены окружение, Redis (общий счётчик — двойник с той же семантикой, что
 * Lua-скрипт), `fetch` и SMTP-отправка.
 *
 * @probe 2026-10-30 — по одному, с откатом; красное — что наблюдалось:
 *   1. в `takeLocalBudget` убрана проверка потолка (всегда «можно») → 5 failed,
 *      среди них «ошибки: не больше 12 в час…» и «…не больше 60 за сутки»;
 *   2. `limitsFor` отдаёт предупреждениям потолок ошибок → 2 failed:
 *      «предупреждения берут только половину…», «отказ не тратит место»;
 *   3. отказ тратит место (счётчик прибавляется до проверки) → те же 2 failed;
 *   4. письмо собирается из сырой меты (`JSON.stringify(context)` вместо
 *      строк `formatContext`) → 1 failed: «письмо — те же разрешённые и
 *      очищенные поля…» (в тексте `cmuser0000000000000001`);
 *   5. общий счётчик не читается (`takeSharedBudget` без соединения) → 1
 *      failed: «потолок общий на процессы…» — второй процесс получил 'sent'
 *      сверх 12.
 */

const envState = vi.hoisted(() => ({
  NODE_ENV: "production",
  MONITORING_TELEGRAM_BOT_TOKEN: "bot-token" as string | undefined,
  MONITORING_TELEGRAM_CHAT_ID: "chat-id" as string | undefined,
  MONITORING_ALERT_EMAIL_TO: "ops@masterryadom.ru, ops@masterryadom.ru,dev@masterryadom.ru" as string | undefined,
  SMTP_HOST: "smtp.yandex.ru" as string | undefined,
  SMTP_USER: "noreply@masterryadom.ru",
  SMTP_PASS: "secret",
}));

const redis = vi.hoisted(() => ({
  connection: null as Promise<unknown> | null,
}));

const trySendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: envState, isProduction: true }));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: () => redis.connection,
  peekRedisConnection: () => redis.connection,
  withRedisCommandTimeout: (_operation: string, promise: Promise<unknown>) => promise,
}));
vi.mock("@/lib/email/sender", () => ({ trySendEmail }));

const fetchMock = vi.fn();
const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

const T0 = new Date("2026-10-30T10:00:00.000Z").getTime();

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Свежий процесс: счётчик писем и пауза алертов — пустые. */
async function loadProcess() {
  vi.resetModules();
  const email = await import("@/lib/monitoring/alert-email");
  const logger = await import("@/lib/logging/logger");
  const alert = await import("@/lib/monitoring/alert");
  return { ...email, logError: logger.logError, sendAlert: alert.sendAlert };
}

/** Двойник общего счётчика: та же семантика, что `TAKE_BUDGET_SCRIPT`. */
function fakeRedis() {
  const store = new Map<string, number>();
  const keysSeen: string[][] = [];
  const client = {
    eval: vi.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
      keysSeen.push(options.keys);
      const [hourKey, dayKey] = options.keys;
      const hourly = store.get(hourKey!) ?? 0;
      const daily = store.get(dayKey!) ?? 0;
      if (hourly >= Number(options.arguments[0]) || daily >= Number(options.arguments[1])) {
        return [0, hourly, daily];
      }
      store.set(hourKey!, hourly + 1);
      store.set(dayKey!, daily + 1);
      return [1, hourly + 1, daily + 1];
    }),
  };
  return { client, store, keysSeen };
}

beforeEach(() => {
  envState.MONITORING_TELEGRAM_BOT_TOKEN = "bot-token";
  envState.MONITORING_TELEGRAM_CHAT_ID = "chat-id";
  envState.MONITORING_ALERT_EMAIL_TO = "ops@masterryadom.ru, ops@masterryadom.ru,dev@masterryadom.ru";
  envState.SMTP_HOST = "smtp.yandex.ru";
  redis.connection = null;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
  trySendEmail.mockReset();
  trySendEmail.mockResolvedValue({ status: "sent" });
  consoleError.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("письмо-алерт — то же содержимое, что Telegram", () => {
  it("письмо — те же разрешённые и очищенные поля; ПДн остаются в логе", async () => {
    const { logError } = await loadProcess();
    logError("Partnership email send failed", {
      requestId: "req-42",
      route: "POST /api/support/partnership",
      userProfileId: "cmuser0000000000000001",
      ip: "203.0.113.7",
      error: "Unique constraint failed: anna@example.com, +7 999 123-45-67",
    });
    // `logError` шлёт алерт через `void`, письмо — после динамического импорта.
    await vi.waitFor(() => expect(trySendEmail).toHaveBeenCalledTimes(1));
    const mail = trySendEmail.mock.calls[0]![0] as { to: string; subject: string; text: string; html: string };
    // Адресаты без повторов, через запятую.
    expect(mail.to).toBe("ops@masterryadom.ru, dev@masterryadom.ru");
    expect(mail.subject).toBe("[МастерРядом] ERROR: Partnership email send failed");
    expect(mail.text).toContain("requestId: req-42");
    expect(mail.text).toContain("route: POST /api/support/partnership");
    expect(mail.text).toContain("(ещё полей в логе: 2)");
    for (const leaked of ["cmuser0000000000000001", "203.0.113.7", "anna@example.com", "123-45-67"]) {
      expect(mail.text).not.toContain(leaked);
      expect(mail.html).not.toContain(leaked);
    }

    // Telegram получил то же и в прежнем виде.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const tg = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as { text: string };
    expect(tg.text).toContain("⚠️ ERROR");
    expect(tg.text).toContain("[МастерРядом] ⚠️ Partnership email send failed");
    expect(tg.text).toContain("requestId: req-42");
    expect(tg.text).not.toContain("cmuser0000000000000001");
  });

  it("HTML письма экранирован, тема — одна строка", async () => {
    const { sendAlert } = await loadProcess();
    await sendAlert("critical", "Сбой <script>\r\nBcc: x@evil.test", { requestId: "<b>r</b>" });

    const mail = trySendEmail.mock.calls[0]![0] as { subject: string; html: string };
    // Перевод строки схлопнут (чужой заголовок не вставить), адрес — скрыт скраббером.
    expect(mail.subject).toBe("[МастерРядом] CRITICAL: Сбой <script> Bcc: [email]");
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&lt;b&gt;r&lt;/b&gt;");
    expect(mail.html).not.toContain("<script>");
  });

  it("только почта (без Telegram) — письмо уходит, запасной лог не пишется", async () => {
    envState.MONITORING_TELEGRAM_BOT_TOKEN = undefined;
    const { sendAlert } = await loadProcess();
    await sendAlert("error", "Очередь встала", { requestId: "req-1" });

    expect(trySendEmail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("ни Telegram, ни почты — алерт уходит в structured log", async () => {
    envState.MONITORING_TELEGRAM_BOT_TOKEN = undefined;
    envState.MONITORING_ALERT_EMAIL_TO = undefined;
    const { sendAlert } = await loadProcess();
    await sendAlert("error", "Очередь встала", { requestId: "req-1" });

    expect(trySendEmail).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")).toContain("Очередь встала");
  });

  it("адресаты есть, SMTP нет — письма нет", async () => {
    envState.SMTP_HOST = undefined;
    const { sendAlert, isAlertEmailConfigured } = await loadProcess();
    expect(isAlertEmailConfigured()).toBe(false);
    await sendAlert("error", "Очередь встала");
    expect(trySendEmail).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("отказ SMTP не бросает и не порождает нового алерта", async () => {
    trySendEmail.mockResolvedValue({ status: "failed", error: new Error("535 auth failed") });
    const { sendAlert } = await loadProcess();
    await expect(sendAlert("error", "Очередь встала")).resolves.toBeUndefined();
    await flush();

    expect(trySendEmail).toHaveBeenCalledTimes(1);
    const log = consoleError.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(log).toContain("Alert email not sent");
    expect(log).toContain("535 auth failed");
    // Запись об отказе — с __skipAlert: второго письма и сообщения в чат нет.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("потолок писем-алертов", () => {
  it("ошибки: не больше 12 в час; последнее письмо говорит о потолке", async () => {
    const { sendAlertEmail } = await loadProcess();
    const outcomes: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      outcomes.push(await sendAlertEmail({ level: "error", subject: `s${i}`, text: `t${i}` }));
    }
    expect(outcomes.slice(0, 12)).toEqual(Array(12).fill("sent"));
    expect(outcomes[12]).toBe("budget");
    expect(trySendEmail).toHaveBeenCalledTimes(12);

    const texts = trySendEmail.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts[10]).not.toContain("потолок");
    expect(texts[11]).toContain("до конца часа: потолок 12");
  });

  it("новый час — снова можно, но не больше 60 за сутки", async () => {
    const { sendAlertEmail } = await loadProcess();
    let sent = 0;
    let lastText = "";
    for (let hour = 0; hour < 6; hour += 1) {
      vi.setSystemTime(T0 + hour * 60 * 60_000);
      for (let i = 0; i < 12; i += 1) {
        const outcome = await sendAlertEmail({ level: "critical", subject: "s", text: "t" });
        if (outcome === "sent") {
          sent += 1;
          lastText = (trySendEmail.mock.calls.at(-1)![0] as { text: string }).text;
        }
      }
    }
    expect(sent).toBe(60);
    expect(lastText).toContain("до конца суток (UTC): потолок 60");
  });

  it("предупреждения берут только половину — ошибкам остаётся", async () => {
    const { sendAlertEmail } = await loadProcess();
    for (let i = 0; i < 6; i += 1) {
      expect(await sendAlertEmail({ level: "warning", subject: "w", text: "w" })).toBe("sent");
    }
    expect(await sendAlertEmail({ level: "warning", subject: "w", text: "w" })).toBe("budget");
    const lastWarning = (trySendEmail.mock.calls[5]![0] as { text: string }).text;
    expect(lastWarning).toContain("Предупреждений письмом больше не будет до конца часа: потолок 6");

    for (let i = 0; i < 6; i += 1) {
      expect(await sendAlertEmail({ level: "error", subject: "e", text: "e" })).toBe("sent");
    }
    expect(await sendAlertEmail({ level: "error", subject: "e", text: "e" })).toBe("budget");
  });

  it("отказ не тратит место", async () => {
    const { sendAlertEmail } = await loadProcess();
    for (let i = 0; i < 6; i += 1) await sendAlertEmail({ level: "warning", subject: "w", text: "w" });
    // Сто отказанных предупреждений не съедают места ошибок.
    for (let i = 0; i < 100; i += 1) {
      expect(await sendAlertEmail({ level: "warning", subject: "w", text: "w" })).toBe("budget");
    }
    expect(await sendAlertEmail({ level: "error", subject: "e", text: "e" })).toBe("sent");
  });

  it("потолок общий на процессы: счётчик в Redis, ключи часа и суток", async () => {
    const shared = fakeRedis();
    redis.connection = Promise.resolve(shared.client);

    const first = await loadProcess();
    for (let i = 0; i < 8; i += 1) {
      expect(await first.sendAlertEmail({ level: "error", subject: "s", text: "t" })).toBe("sent");
    }
    const second = await loadProcess();
    const outcomes: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      outcomes.push(await second.sendAlertEmail({ level: "error", subject: "s", text: "t" }));
    }
    expect(outcomes).toEqual(["sent", "sent", "sent", "sent", "budget", "budget"]);

    const hourIndex = Math.floor(T0 / (60 * 60_000));
    const dayIndex = Math.floor(T0 / (24 * 60 * 60_000));
    expect(shared.keysSeen[0]).toEqual([`mon:alert:email:h:${hourIndex}`, `mon:alert:email:d:${dayIndex}`]);
  });

  it("Redis не ответил — считает процесс, письмо не теряется", async () => {
    redis.connection = Promise.resolve({
      eval: vi.fn(async () => {
        throw new Error("REDIS_COMMAND_TIMEOUT");
      }),
    });
    const { sendAlertEmail } = await loadProcess();
    expect(await sendAlertEmail({ level: "error", subject: "s", text: "t" })).toBe("sent");
    for (let i = 0; i < 11; i += 1) await sendAlertEmail({ level: "error", subject: "s", text: "t" });
    expect(await sendAlertEmail({ level: "error", subject: "s", text: "t" })).toBe("budget");
  });
});
