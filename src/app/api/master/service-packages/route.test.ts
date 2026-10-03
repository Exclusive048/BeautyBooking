import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-MASTER-C — `GET /api/master/service-packages`: все пакеты личного
 * профиля мастера (форма и порядок — `service-packages-list.test.ts`).
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const getCurrentMasterProviderId = vi.hoisted(() => vi.fn());
const listMasterServicePackages = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/master/access", () => ({ getCurrentMasterProviderId }));
vi.mock("@/lib/master/services-view.service", () => ({ listMasterServicePackages }));
vi.mock("@/lib/master/services-mutations", () => ({ createMasterPackage: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), getRequestId: () => "req" }));

import { GET } from "./route";

type Body = { ok: boolean; data?: { packages: unknown[] }; error?: { code: string; message: string } };

const call = () => GET(new Request("http://localhost/api/master/service-packages"));

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
  getCurrentMasterProviderId.mockResolvedValue("master-1");
});

describe("GET /api/master/service-packages", () => {
  it("без сессии — 401", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(((await res.json()) as Body).error?.code).toBe("UNAUTHORIZED");
    expect(listMasterServicePackages).not.toHaveBeenCalled();
  });

  it("не мастер — 403 как есть", async () => {
    getCurrentMasterProviderId.mockRejectedValue(new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN"));
    const res = await call();
    expect(res.status).toBe(403);
    expect(((await res.json()) as Body).error?.code).toBe("FORBIDDEN");
  });

  it("200: пакеты личного профиля, no-store", async () => {
    const packages = [{ id: "pkg-1", isEnabled: false }];
    listMasterServicePackages.mockResolvedValue(packages);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await res.json()) as Body).data).toEqual({ packages });
    expect(listMasterServicePackages).toHaveBeenCalledWith("master-1");
  });

  it("сбой — 500 с текстом по канону", async () => {
    listMasterServicePackages.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(((await res.json()) as Body).error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Не удалось загрузить пакеты. Попробуйте ещё раз.",
    });
  });
});
