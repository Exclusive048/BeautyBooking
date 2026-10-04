import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-STUDIO-C — `POST /api/studio/services` с `onlinePaymentEnabled: true`
 * проходит тот же гейт тарифа, что и `PATCH /api/studio/services/{id}`; без
 * флага гейт не зовётся (создание на бесплатном тарифе не ломается).
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const ensureStudioRole = vi.hoisted(() => vi.fn());
const createStudioService = vi.hoisted(() => vi.fn());
const ensureStudioOnlinePaymentsAllowed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/access", () => ({ ensureStudioRole }));
vi.mock("@/lib/studio/services.service", () => ({ createStudioService, getStudioServices: vi.fn() }));
vi.mock("@/lib/studio/online-payments-gate", () => ({ ensureStudioOnlinePaymentsAllowed }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/studio/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const BODY = { studioId: "studio-1", title: "Маникюр", globalCategoryId: "gc-1", basePrice: 150_000, baseDurationMin: 60 };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
  ensureStudioRole.mockResolvedValue(undefined);
  createStudioService.mockResolvedValue({ id: "svc-1" });
});

describe("POST /api/studio/services — онлайн-оплата", () => {
  it("без флага гейт не зовётся", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(201);
    expect(ensureStudioOnlinePaymentsAllowed).not.toHaveBeenCalled();
  });

  it("с флагом — гейт; создаётся с онлайн-оплатой", async () => {
    const res = await post({ ...BODY, onlinePaymentEnabled: true });
    expect(res.status).toBe(201);
    expect(ensureStudioOnlinePaymentsAllowed).toHaveBeenCalledWith("user-1");
    expect(createStudioService).toHaveBeenCalledWith(
      expect.objectContaining({ onlinePaymentEnabled: true, proposerUserId: "user-1" }),
    );
  });

  it("гейт не пропустил — 403 как есть, услуга не создаётся", async () => {
    ensureStudioOnlinePaymentsAllowed.mockRejectedValue(
      new AppError("Это доступно на тарифах выше. Откройте раздел «Подписка», чтобы перейти.", 403, "FEATURE_GATE", {
        feature: "onlinePayments",
        requiredPlan: "PRO",
      }),
    );
    const res = await post({ ...BODY, onlinePaymentEnabled: true });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FEATURE_GATE");
    expect(createStudioService).not.toHaveBeenCalled();
  });
});
