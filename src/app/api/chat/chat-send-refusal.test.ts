import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FIX-C12 · CHAT-SEND-OUTAGE-CODE-ASYMMETRY — последний сайт того дефекта,
 * который FIX-C11 закрыл на путях записи брони.
 *
 * Путь `/api/chat/threads` чувствителен (FIX-B12; с 29.09 доработки · 15 —
 * по шаблону пути в ключе, прежде — префиксом ключа `rate:chatSend:`), то есть
 * при обрыве Redis отказ ЕСТЬ — и пользователь, отправляющий ПЕРВОЕ сообщение,
 * читал «Слишком много сообщений. Подождите немного.». Политика не меняется:
 * роут отказывает и там, и там. Меняются код и текст.
 *
 * Проверяется ПУТЬ, а не только код: при отказе сообщение не должно быть
 * отправлено вовсе (`sendConversationMessage` не вызывается) — иначе «отказ»
 * означал бы 503 поверх успешной записи.
 *
 * @probe   что сломать: вернуть в роут legacy-перегрузку
 *          `checkRateLimit(key, RATE_LIMIT.limit, RATE_LIMIT.windowSeconds)`
 *          с `if (!allowed) return jsonFail(429, …)`.
 *          наблюдалось: «обрыв обязан читаться как 503: получено 429» → красный.
 *          С 29.09 доработки · 15 перегрузки нет — такой возврат не компилируется
 *          (`rate-limit/keys.test.ts`).
 */

const checkRateLimit = vi.hoisted(() => vi.fn());
const sendConversationMessage = vi.hoisted(() => vi.fn(async () => ({ id: "m1" })));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/auth/access", () => ({
  getSessionUser: async () => ({ userId: "u1", roles: [] }),
}));
vi.mock("@/lib/chat/message-sender", () => ({ sendConversationMessage }));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logError: () => {},
  logInfo: () => {},
}));

const { POST } = await import("@/app/api/chat/threads/[slug]/messages/route");

function call() {
  const req = new Request("https://app.test/api/chat/threads/t1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "привет" }),
  });
  return POST(req as never, { params: Promise.resolve({ slug: "t1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendConversationMessage.mockResolvedValue({ id: "m1" });
});

describe("FIX-C12 · отказ отправки сообщения называет причину", () => {
  it("🔴 обрыв зависимости → 503 RATE_LIMIT_UNAVAILABLE", async () => {
    checkRateLimit.mockResolvedValue({
      limited: true,
      retryAfterSeconds: 60,
      reason: "unavailable",
    });

    const res = await call();
    const payload = (await res.json()) as { error?: { message?: string; code?: string } };

    expect(res.status, "обрыв обязан читаться как 503, а не 429").toBe(503);
    expect(payload.error?.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(payload.error?.message).toContain("недоступн");
    expect(
      sendConversationMessage,
      "отказ обязан быть отказом: сообщение не должно уйти",
    ).not.toHaveBeenCalled();
  });

  it("исчерпанный бюджет → 429 со СВОИМ текстом поверхности", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60 });

    const res = await call();
    const payload = (await res.json()) as { error?: { message?: string; code?: string } };

    expect(res.status).toBe(429);
    expect(payload.error?.code).toBe("RATE_LIMITED");
    // Копия точнее общей: «сообщений», а не «запросов».
    expect(payload.error?.message).toContain("сообщений");
    expect(sendConversationMessage).not.toHaveBeenCalled();
  });

  it("лимит пройден → сообщение отправляется (тест не вакуумен)", async () => {
    checkRateLimit.mockResolvedValue({ limited: false });

    const res = await call();

    expect(res.status, "успешная отправка отвечает 201 Created").toBe(201);
    expect(sendConversationMessage).toHaveBeenCalledTimes(1);
  });
});
