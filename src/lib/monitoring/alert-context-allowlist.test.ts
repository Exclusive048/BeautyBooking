import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ALERT-CONTEXT-ALLOWLIST (D-02) — что из меты доезжает до Telegram.
 *
 * `logError` отдавал алерту свою мету целиком, а `sendAlert` сериализовал
 * каждую пару и слал в ops-чат: `userProfileId`, `ip`, полный адрес страницы
 * с токеном «Управлять записью», почты из диагностики SMTP. Тест гонит
 * НАСТОЯЩИЕ `logError` → паузу `alert-cooldown.ts` → `sendAlert` и смотрит в
 * тело запроса к Telegram Bot API — туда, куда уходит утечка, а не в аргументы
 * промежуточной функции: иначе фильтр «в logError, но не в sendAlert» прошёл
 * бы зелёным, оставив открытыми `sendTelegramAlert` и прямые `alertWarning`.
 * Подменены только окружение, Redis (пауза — в памяти) и `fetch`.
 *
 * @probe 2026-10-30 — по одному, с откатом:
 *   1. список запрещённого вместо разрешённого — в `formatContext` отбрасывать
 *      ровно пять ключей из постановки (`userProfileId`, `ip`, `url`, `phone`,
 *      `email`) → 2 failed: «посторонние ключи меты не уходят в чат» —
 *      «expected '…' not to contain 'authorId'» и «прямой alertWarning…» —
 *      «not to contain 'cmuser0000000000000002'»: id автора и `userId` —
 *      другие имена того же;
 *   2. ключи фильтруются, значения не скраббятся (`formatAlertValue` без
 *      `scrubString`) → 1 failed: «разрешённые поля — после скраббера» —
 *      «expected '…' not to contain 'anna@example.com'»;
 *   3. фильтр в `logError` (мета режется до `{requestId, route, error, stack,
 *      message}` перед `alertLoggedError`), а `sendAlert` пропускает всё →
 *      2 failed: «прямой alertWarning…» — «not to contain
 *      'cmuser0000000000000002'» (путь мимо `logError` открыт) и «logError с
 *      ПДн…» — «expected '…' to contain '(ещё полей в логе: 5)'».
 */

const envState = vi.hoisted(() => ({
  NODE_ENV: "production",
  MONITORING_TELEGRAM_BOT_TOKEN: "bot-token",
  MONITORING_TELEGRAM_CHAT_ID: "chat-id",
}));

vi.mock("@/lib/env", () => ({
  env: envState,
  isProduction: true,
}));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: () => null,
  peekRedisConnection: () => null,
  withRedisCommandTimeout: (_operation: string, promise: Promise<unknown>) => promise,
}));

const fetchMock = vi.fn();
const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Свежий процесс: карты паузы алертов пустые. */
async function loadProcess() {
  vi.resetModules();
  const logger = await import("@/lib/logging/logger");
  const monitoring = await import("@/lib/monitoring");
  return { logError: logger.logError, alertWarning: monitoring.alertWarning };
}

/** Тексты сообщений, ушедших в Telegram. */
function telegramTexts(): string[] {
  return fetchMock.mock.calls.map(([, init]) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { text: string };
    return body.text;
  });
}

function structuredLog(): string {
  return consoleError.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
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

const GUEST_URL =
  "https://masterryadom.ru/booking/manage/eyJiaWQiOiJjbWJvb2tpbmcwMDAwMDAwMDAwMDAwMDAxIn0.c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWc?from=sms";

describe("sendAlert — в Telegram только разрешённые поля", () => {
  it("logError с ПДн: ни ключей, ни значений в чате; в structured log — всё", async () => {
    const { logError } = await loadProcess();
    logError("Partnership email send failed", {
      requestId: "req-42",
      route: "POST /api/support/partnership",
      userProfileId: "cmuser0000000000000001",
      ip: "203.0.113.7",
      url: GUEST_URL,
      phone: "+79991234567",
      email: "anna@example.com",
    });
    await flush();

    const texts = telegramTexts();
    expect(texts).toHaveLength(1);
    const text = texts[0]!;
    expect(text).toContain("requestId: req-42");
    expect(text).toContain("route: POST /api/support/partnership");
    for (const leaked of [
      "userProfileId",
      "cmuser0000000000000001",
      "ip:",
      "203.0.113.7",
      "url:",
      "booking/manage",
      "eyJiaWQi",
      "phone:",
      "79991234567",
      "email:",
      "anna@example.com",
    ]) {
      expect(text).not.toContain(leaked);
    }
    expect(text).toContain("(ещё полей в логе: 5)");

    // Отброшенное не пропало: structured log пишется до алерта и целиком.
    expect(structuredLog()).toContain("cmuser0000000000000001");
  });

  it("посторонние ключи меты не уходят в чат (список разрешённого, а не запрещённого)", async () => {
    const { logError } = await loadProcess();
    logError("Review moderation failed", {
      requestId: "req-43",
      authorId: "cmuser0000000000000002",
      clientName: "Анна Соколова",
      address: "Москва, Тверская, 1",
      smtpUser: "anna@example.com",
    });
    await flush();

    const text = telegramTexts()[0]!;
    for (const leaked of ["authorId", "cmuser0000000000000002", "Анна Соколова", "Тверская", "smtpUser"]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("разрешённые поля — после скраббера и с обрезкой стека", async () => {
    const { logError } = await loadProcess();
    const stack = ["Error: boom", ...Array.from({ length: 20 }, (_, i) => `    at frame${i} (file.ts:${i})`)].join("\n");
    logError("Prisma write failed", {
      requestId: "req-44",
      error: `Unique constraint failed: anna@example.com, +7 999 123-45-67, ${GUEST_URL}`,
      stack,
    });
    await flush();

    const text = telegramTexts()[0]!;
    expect(text).toContain("error: Unique constraint failed");
    for (const leaked of ["anna@example.com", "123-45-67", "eyJiaWQi", "from=sms"]) {
      expect(text).not.toContain(leaked);
    }
    expect(text).toContain("frame4");
    expect(text).not.toContain("frame5");
  });

  it("прямой alertWarning (мимо logError) — тот же фильтр", async () => {
    const { alertWarning } = await loadProcess();
    // Форма из `deletion/delete-account.ts`.
    await alertWarning("User account deleted", { userId: "cmuser0000000000000002" });

    const text = telegramTexts()[0]!;
    expect(text).toContain("User account deleted");
    expect(text).not.toContain("cmuser0000000000000002");
  });

  it("undefined и Error в значениях не роняют отправку", async () => {
    const { alertWarning } = await loadProcess();
    await expect(
      alertWarning("Worker crashed", { error: new Error("disk full"), stack: undefined }),
    ).resolves.toBeUndefined();

    const text = telegramTexts()[0]!;
    expect(text).toContain("disk full");
    expect(text).not.toContain("stack:");
  });
});
