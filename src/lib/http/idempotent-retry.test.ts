import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  fetchRetryingDuplicates,
  isDuplicateRequestResponse,
} from "@/lib/http/idempotent-retry";

/**
 * LOGIC-10 — двойной клик по «Записаться» не показывается как «время занято».
 *
 * Серверная идемпотентность отвечает проигравшему `409 DUPLICATE_REQUEST`,
 * пока победитель не дописал Serializable-транзакцию. Клиенты трактовали ЛЮБОЙ
 * 409 как конфликт слота: степпер показывал экран «время занято» и РОТИРОВАЛ
 * ключ, после чего повтор упирался в собственную только что созданную бронь и
 * получал уже настоящий `SLOT_CONFLICT`; пакетные визарды отправляли клиента
 * пересобирать пакет. Пользователь, чья запись создана, видел ровно обратное.
 *
 * Слои: серверный бюджет ожидания (10 × 200 мс вместо 3 × 100 мс — прежний был
 * короче типичной транзакции), клиентский повтор ТЕМ ЖЕ ключом, и разделение
 * кодов на трёх поверхностях.
 */

const fetchMock = vi.fn();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const DUPLICATE = () => json(409, { ok: false, error: { code: "DUPLICATE_REQUEST" } });
const SLOT_TAKEN = () => json(409, { ok: false, error: { code: "SLOT_CONFLICT" } });
const CREATED = () => json(200, { ok: true, data: { booking: { id: "b1" } } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isDuplicateRequestResponse — 409 не равно 409", () => {
  it("отличает «запрос ещё выполняется» от конфликта слота", async () => {
    expect(await isDuplicateRequestResponse(DUPLICATE())).toBe(true);
    expect(await isDuplicateRequestResponse(SLOT_TAKEN())).toBe(false);
  });

  it("не трогает не-409 и переживает нечитаемое тело", async () => {
    expect(await isDuplicateRequestResponse(CREATED())).toBe(false);
    expect(
      await isDuplicateRequestResponse(new Response("<html>", { status: 409 })),
    ).toBe(false);
  });

  it("оставляет тело читаемым для вызывающего (читает клон)", async () => {
    const response = DUPLICATE();
    await isDuplicateRequestResponse(response);
    // Иначе вызывающий получил бы «body already consumed» вместо ответа.
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DUPLICATE_REQUEST" },
    });
  });
});

describe("fetchRetryingDuplicates — повтор ТЕМ ЖЕ ключом", () => {
  it("повторяет, пока победитель не закоммитился, и отдаёт его результат", async () => {
    fetchMock.mockResolvedValueOnce(DUPLICATE()).mockResolvedValueOnce(CREATED());

    const res = await fetchRetryingDuplicates("/api/public/bookings", {
      method: "POST",
      headers: { "x-idempotency-key": "req-1" },
      body: "{}",
    }, { delayMs: 0 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Ключ обязан быть тем же — иначе сервер заведёт ВТОРУЮ бронь вместо того,
    // чтобы отдать первую.
    const keys = fetchMock.mock.calls.map((c) => c[1].headers["x-idempotency-key"]);
    expect(new Set(keys).size).toBe(1);
  });

  it("конфликт слота не повторяется — это настоящий отказ", async () => {
    fetchMock.mockResolvedValue(SLOT_TAKEN());

    const res = await fetchRetryingDuplicates("/api/public/bookings", { method: "POST", body: "{}" }, { delayMs: 0 });

    expect(res.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("успех с первого раза не повторяется", async () => {
    fetchMock.mockResolvedValue(CREATED());
    await fetchRetryingDuplicates("/api/public/bookings", { method: "POST", body: "{}" }, { delayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("бюджет попыток конечен — зависший победитель не крутит клиента вечно", async () => {
    fetchMock.mockResolvedValue(DUPLICATE());

    const res = await fetchRetryingDuplicates(
      "/api/public/bookings",
      { method: "POST", body: "{}" },
      { attempts: 3, delayMs: 0 },
    );

    expect(res.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

/**
 * Структурный слой: сама разница кодов бесполезна, пока три поверхности её не
 * применяют. Именно в них и жил дефект.
 */
const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("LOGIC-10 · три поверхности различают коды", () => {
  it("booking-степпер: DUPLICATE_REQUEST не ротирует ключ и не показывает «время занято»", () => {
    const source = read("features/booking/components/booking-flow/booking-flow-stepper.tsx");
    expect(source).toContain("fetchRetryingDuplicates");
    // Проверка идёт ДО `dispatch({ type: "submitConflict" })` и до ротации.
    const conflictBranch = /if \(res\.status === 409\) \{([\s\S]*?)\n      \}/.exec(source)?.[1] ?? "";
    expect(conflictBranch).toContain("isDuplicateRequestResponse");
    expect(conflictBranch.indexOf("isDuplicateRequestResponse")).toBeLessThan(
      conflictBranch.indexOf("submitConflict"),
    );
    expect(conflictBranch).toContain("submitInFlight");
  });

  it.each([
    "features/public-profile/master/components/package-booking-flow.tsx",
    "features/public-studio/components/studio-package-flow.tsx",
  ])("%s: DUPLICATE_REQUEST не отправляет пересобирать пакет", (file) => {
    const source = read(file);
    expect(source).toContain("fetchRetryingDuplicates");
    expect(source).toContain(
      'if (res.status === 409 && !(await isDuplicateRequestResponse(res)))',
    );
  });

  it("серверный бюджет ожидания больше типичной транзакции", () => {
    const source = read("lib/bookings/idempotency.ts");
    const attempts = /IDEMPOTENCY_WAIT_ATTEMPTS = (\d+)/.exec(source)?.[1];
    const delay = /IDEMPOTENCY_WAIT_DELAY_MS = (\d+)/.exec(source)?.[1];
    // Прежние 3 × 100 мс = 300 мс — короче, чем логируемый `transactionMs`.
    expect(Number(attempts) * Number(delay)).toBeGreaterThanOrEqual(2000);
  });
});
