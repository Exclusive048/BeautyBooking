import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ALERT-CONTEXT-ALLOWLIST (D-02) — клиентский отчёт об ошибке: что из него
 * оседает в логе и сколько сообщений он стоит ops-чату.
 *
 * Отчёт шлёт каждый error boundary, адрес — `window.location.href`. Со страницы
 * «Управлять записью» это действующий предъявительский токен (120 дней, отмена
 * и перенос чужой записи), и он уходил и в structured log, и в Telegram. А
 * группа паузы алерта была присланным `message`: каждое новое сообщение —
 * новое сообщение в чат.
 *
 * Роут, логгер, пауза и `sendAlert` — НАСТОЯЩИЕ; подменены лимитер, окружение,
 * Redis (пауза — в памяти) и `fetch`. Токен — настоящий, его выпускает модуль
 * ссылки, а не строка под шаблон.
 *
 * @probe 2026-10-30 — по одному, с откатом:
 *   1. положить в лог и сырой `url` рядом с шаблоном (`{ ...report, url,
 *      userAgent }` — «для отладки») → 1 failed: «токен из адреса и из текста
 *      ошибки не доходит ни до лога, ни до чата» — «expected '{"level":"error",
 *      "message":"[client-e…' not to contain 'eyJiaWQiOiJjbWJvb2tpbmcwMDAwMDAw…'»;
 *   2. вернуть группу паузы из присланного текста (ключ алерта
 *      `` `${CLIENT_ERROR_ALERT_KEY}:${message ?? digest}` ``) → 1 failed:
 *      «разные тексты от анонима — одно сообщение в чат» — «expected [ …(5) ]
 *      to have a length of 1 but got 5»;
 *   3. снять `__skipAlert` с записи в лог (отчёт снова идёт алертом `logError`
 *      и в счётчик частоты ошибок API) → 2 failed: «…got 2» и «…got 3» —
 *      второй алерт того же отчёта и критический «Высокая частота ошибок API»
 *      на пятом анонимном отчёте.
 */

const envState = vi.hoisted(() => ({
  NODE_ENV: "production",
  MONITORING_TELEGRAM_BOT_TOKEN: "bot-token",
  MONITORING_TELEGRAM_CHAT_ID: "chat-id",
  AUTH_JWT_SECRET: "test-auth-jwt-secret-0123456789abcdef",
}));

vi.mock("@/lib/env", () => ({ env: envState, isProduction: true }));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: () => null,
  peekRedisConnection: () => null,
  withRedisCommandTimeout: (_operation: string, promise: Promise<unknown>) => promise,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/rate-limit/keys", () => ({ routeRateLimitKey: () => "rl:test" }));
vi.mock("@/lib/http/ip", () => ({ getClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn(), reportError: vi.fn() }));

const fetchMock = vi.fn();
const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Свежий процесс: карты паузы алертов пустые. */
async function loadRoute() {
  vi.resetModules();
  const route = await import("./route");
  const token = await import("@/lib/bookings/guest-manage-token");
  return { POST: route.POST, signGuestManageToken: token.signGuestManageToken };
}

function report(POST: (req: Request) => Promise<Response>, body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function telegramTexts(): string[] {
  return fetchMock.mock.calls.map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { text: string }).text);
}

function structuredLog(): string {
  return consoleError.mock.calls.map((call) => String(call[0])).join("\n");
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
  consoleError.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/log-error — адрес шаблоном, пауза алерта общая", () => {
  it("токен из адреса и из текста ошибки не доходит ни до лога, ни до чата", async () => {
    const { POST, signGuestManageToken } = await loadRoute();
    const token = signGuestManageToken("cmbooking0000000000000001");
    const res = await report(POST, {
      message: `Failed to fetch /api/public/bookings/manage/${token}/cancel`,
      digest: "1234567890",
      url: `https://masterryadom.ru/booking/manage/${token}?from=sms#review`,
      userAgent: "Mozilla/5.0",
    });
    expect(res.status).toBe(200);
    await flush();

    const log = structuredLog();
    expect(log).toContain("[client-error-boundary]");
    expect(log).toContain('"route":"/booking/manage/:token"');
    expect(log).not.toContain(token);
    expect(log).not.toContain("from=sms");

    const texts = telegramTexts();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("route: /booking/manage/:token");
    expect(texts[0]).toContain("digest: 1234567890");
    expect(texts[0]).toContain("errorMessage: Failed to fetch /api/public/bookings/manage/[redacted]/cancel");
    expect(texts[0]).not.toContain(token);
    expect(texts[0]).not.toContain("Mozilla");
  });

  it("разные тексты от анонима — одно сообщение в чат, повторы считаются", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 5; i += 1) {
      await report(POST, { message: `spam message ${i}`, url: "/catalog" });
    }
    await flush();
    // Ровно одно: и алерт отчёта под общим ключом, и мимо критического
    // «Высокая частота ошибок API» (пять отчётов — его порог).
    expect(telegramTexts()).toHaveLength(1);
    expect(telegramTexts()[0]).toContain("[client-error-boundary]");
    // Каждый отчёт при этом в логе.
    expect(structuredLog().match(/\[client-error-boundary\]/g)).toHaveLength(5);
  });
});
