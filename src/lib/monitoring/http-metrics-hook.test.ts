import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADMIN-HEALTH-01 — хук на `http.Server` действительно видит запросы.
 *
 * Тест поднимает НАСТОЯЩИЙ Node-сервер на порту 0 и делает HTTP-запросы —
 * мок `emit` доказал бы только форму патча, а не то, что Node зовёт его на
 * реальном запросе и что `finish` ответа наступает.
 *
 * @probe  С заменой `res.once("finish", …)` на пустышку `recordApiRequest`
 *         не вызывался — тест «/api/foo учитывается» краснел. С условием
 *         `startsWith("/api")` (без слеша) `/apix` начинал учитываться —
 *         краснел тест на исключения.
 */

const recordApiRequest = vi.fn();
vi.mock("@/lib/monitoring/api-metrics", () => ({
  recordApiRequest: (...args: unknown[]) => recordApiRequest(...args),
}));

import { installHttpApiMetricsHook, shouldMeasureRequestPath } from "@/lib/monitoring/http-metrics-hook";

describe("shouldMeasureRequestPath", () => {
  it("только /api/*, кроме проб здоровья", () => {
    expect(shouldMeasureRequestPath("/api/bookings")).toBe(true);
    expect(shouldMeasureRequestPath("/api/bookings?x=1")).toBe(true);
    expect(shouldMeasureRequestPath("/api/admin/dashboard/health")).toBe(true);
    expect(shouldMeasureRequestPath("/api/health")).toBe(false);
    expect(shouldMeasureRequestPath("/api/health/ready")).toBe(false);
    expect(shouldMeasureRequestPath("/api/health/worker?x")).toBe(false);
    expect(shouldMeasureRequestPath("/apix/foo")).toBe(false);
    expect(shouldMeasureRequestPath("/cabinet/master")).toBe(false);
    expect(shouldMeasureRequestPath("/")).toBe(false);
    expect(shouldMeasureRequestPath(undefined)).toBe(false);
  });
});

describe("installHttpApiMetricsHook", () => {
  let server: http.Server;
  let base = "";

  beforeAll(async () => {
    expect(installHttpApiMetricsHook()).toBe(true);
    expect(installHttpApiMetricsHook()).toBe(false);
    server = http.createServer((req, res) => {
      const status = req.url?.includes("boom") ? 503 : 200;
      setTimeout(() => {
        res.statusCode = status;
        res.end("ok");
      }, 15);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    recordApiRequest.mockClear();
  });

  it("запрос к /api/* учитывается один раз со статусом и длительностью", async () => {
    const res = await fetch(`${base}/api/foo?x=1`);
    await res.text();
    await new Promise((r) => setTimeout(r, 10));

    expect(recordApiRequest).toHaveBeenCalledTimes(1);
    const sample = recordApiRequest.mock.calls[0][0] as { durationMs: number; status: number };
    expect(sample.status).toBe(200);
    expect(sample.durationMs).toBeGreaterThanOrEqual(10);
  });

  it("статус 5xx доезжает до учёта", async () => {
    const res = await fetch(`${base}/api/boom`);
    await res.text();
    await new Promise((r) => setTimeout(r, 10));
    expect(recordApiRequest).toHaveBeenCalledTimes(1);
    expect((recordApiRequest.mock.calls[0][0] as { status: number }).status).toBe(503);
  });

  it("страницы и пробы здоровья не учитываются", async () => {
    for (const path of ["/", "/cabinet", "/api/health", "/api/health/ready"]) {
      const res = await fetch(`${base}${path}`);
      await res.text();
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(recordApiRequest).not.toHaveBeenCalled();
  });
});
