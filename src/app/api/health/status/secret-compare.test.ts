import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-25 — секрет сравнивался голым `===`
 * (`providedSecret === expectedSecret`). Такое сравнение выходит на первом же
 * несовпавшем байте, то есть время ответа коррелирует с длиной верного
 * префикса. В соседних роутах (`health/worker`, cron-эндпоинты) для этого уже
 * используется общий constant-time-хелпер, который вдобавок хеширует обе
 * стороны и потому не утекает длину (SEC-20).
 *
 * Поведенчески «верный секрет → 200, неверный → 401» одинаково у обеих
 * реализаций, поэтому пиннится именно использование хелпера.
 */

const mockEnv = vi.hoisted(() => ({
  WORKER_SECRET: "worker-secret" as string | undefined,
  NODE_ENV: "test",
}));
const requireAdminAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: mockEnv, isProduction: false }));
vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));
vi.mock("@/lib/auth/constant-time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/constant-time")>();
  return { timingSafeStringEqual: vi.fn(actual.timingSafeStringEqual) };
});
vi.mock("@/lib/monitoring/status", () => ({ getAllSurfaceStatuses: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/monitoring/api-alerts", () => ({
  alertDeadJobs: vi.fn(),
  alertWorkerDown: vi.fn(),
  track5xxError: vi.fn(),
}));
vi.mock("@/lib/notifications/notifier", () => ({
  getNotificationsNotifierRuntimeStatus: () => ({ mode: "memory" }),
  notificationsNotifier: {},
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) } }));
vi.mock("@/lib/queue/queue", () => ({
  getQueueStats: vi.fn().mockResolvedValue({ pending: 0, processing: 0, dead: 0 }),
}));
vi.mock("@/lib/redis/connection", () => ({ getRedisConnection: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logging/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logging/logger")>();
  return { ...actual, logError: vi.fn() };
});

import { timingSafeStringEqual } from "@/lib/auth/constant-time";
import { GET } from "./route";

function request(secret?: string) {
  return new Request("http://localhost/api/health/status", {
    headers: secret === undefined ? {} : { "x-worker-secret": secret },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.WORKER_SECRET = "worker-secret";
  requireAdminAuth.mockResolvedValue({ ok: false });
});

describe("GET /api/health/status — сравнение секрета (SEC-25)", () => {
  it("зовёт `timingSafeStringEqual`, а не сравнивает строки напрямую", async () => {
    await GET(request("worker-secret"));
    expect(timingSafeStringEqual).toHaveBeenCalledWith("worker-secret", "worker-secret");
  });

  it("верный секрет пускает", async () => {
    const res = await GET(request("worker-secret"));
    expect(res.status).toBe(200);
  });

  it("неверный секрет отклоняется тем же путём", async () => {
    const res = await GET(request("wrong"));
    expect(res.status).toBe(401);
    expect(timingSafeStringEqual).toHaveBeenCalledWith("wrong", "worker-secret");
  });

  it("без заголовка сравнение не вызывается — остаётся admin-путь", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(timingSafeStringEqual).not.toHaveBeenCalled();
    expect(requireAdminAuth).toHaveBeenCalled();
  });
});
