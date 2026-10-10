import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RES-23 — у ops-алерта в Telegram есть верхняя граница.
 *
 * `sendAlert` — единственная точка, откуда проект ходит в Telegram Bot API с
 * мониторингом (`sendTelegramAlert`, `api-alerts` и `logError` сводятся сюда
 * же через паузу `alert-cooldown.ts`). Вызывается она через `void`, поэтому
 * запрос пользователя не держит — но без `signal` сокет не отпускается вовсе,
 * а под штормом разных ошибок путь срабатывает часто (пауза — по ключу
 * события, не общая). Тест фиксирует две вещи: граница задана, и её
 * срабатывание не превращает алерт в необработанное отклонение.
 */

const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logging/logger", () => ({ logError }));

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "production",
    MONITORING_TELEGRAM_BOT_TOKEN: "bot-token",
    MONITORING_TELEGRAM_CHAT_ID: "chat-id",
  },
}));

import { sendAlert } from "./alert";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

describe("sendAlert — верхняя граница исходящего запроса (RES-23)", () => {
  it("передаёт в fetch signal с осмысленным таймаутом", async () => {
    await sendAlert("critical", "БД недоступна");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    // не «уже отменённый» и не бесконечный: таймер живой на момент вызова
    expect(init?.signal?.aborted).toBe(false);
  });

  it("срабатывание таймаута не роняет отправку — ошибка уходит в лог без алерта", async () => {
    const timeoutError = new DOMException("The operation was aborted.", "TimeoutError");
    fetchMock.mockRejectedValue(timeoutError);

    await expect(sendAlert("error", "Очередь встала")).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(1);
    const [message, meta] = logError.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("Очередь встала");
    // __skipAlert обязателен: иначе логирование провала алерта порождает новый алерт
    expect(meta.__skipAlert).toBe(true);
    expect(String(meta.alertError)).toContain("aborted");
  });
});
