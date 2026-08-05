import { describe, it, expect, beforeEach, vi } from "vitest";
import { Readable } from "node:stream";
import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";

/**
 * SEC-10 — `?mt=`-ветка отдачи медиа обязана спрашивать И токен, И сессию.
 *
 * Токен сделан аккуратно (HMAC-SHA256 + `timingSafeEqual`, привязка к активу,
 * `exp` ≤ 15 мин, purpose проверяется с обеих сторон), но отвечал он только на
 * вопрос «какой актив». Ветка отдавала файл БЕЗ `getSessionUser` и БЕЗ
 * `ensureCanReadMedia`, то есть утёкшая ссылка — referrer, скриншот, лог
 * прокси — открывала приватный актив кому угодно на срок жизни токена.
 *
 * Соседний чат-роут на том же механизме токенов ведёт себя иначе: токен +
 * сессия + ACL. Две модели доверия на одном механизме — разночтение, которое
 * расползается; тест фиксирует, что осталась одна.
 */

const state = vi.hoisted(() => ({
  tokenValid: true,
  aclAllows: true,
  sessionUser: { id: "u1" } as { id: string } | null,
}));

const spies = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  ensureCanReadMedia: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: () => {
    spies.getSessionUser();
    return Promise.resolve(state.sessionUser);
  },
}));

vi.mock("@/lib/media/access", () => ({
  ensureCanReadMedia: (...args: unknown[]) => {
    spies.ensureCanReadMedia(...args);
    if (!state.aclAllows) {
      return Promise.reject(
        Object.assign(new Error("FORBIDDEN"), { status: 403, code: "FORBIDDEN" }),
      );
    }
    return Promise.resolve();
  },
}));

vi.mock("@/lib/media/private-delivery", () => ({
  PRIVATE_MEDIA_TOKEN_QUERY_PARAM: "mt",
  verifyPrivateMediaDeliveryToken: () => state.tokenValid,
}));

vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({
    getObject: (...args: unknown[]) => {
      spies.getObject(...args);
      return Promise.resolve({
        stream: Readable.from([Buffer.from("bytes")]),
        contentType: "image/webp",
        sizeBytes: 5,
      });
    },
  }),
}));

vi.mock("@/lib/media/service", () => ({
  getMediaFile: vi.fn(),
  isProviderMediaPubliclyVisible: vi.fn(async () => false),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: {
      findUnique: vi.fn(async () => ({
        id: "asset1",
        entityId: "app1",
        storageKey: "k",
        mimeType: "image/webp",
        status: MediaAssetStatus.READY,
        kind: MediaKind.MODEL_APPLICATION_PHOTO,
        entityType: MediaEntityType.MODEL_APPLICATION,
        deletedAt: null,
      })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { GET } from "@/app/api/media/file/[id]/route";

function call() {
  return GET(new Request("http://localhost/api/media/file/asset1?mt=tok"), {
    params: Promise.resolve({ id: "asset1" }),
  });
}

beforeEach(() => {
  state.tokenValid = true;
  state.aclAllows = true;
  state.sessionUser = { id: "u1" };
  spies.getSessionUser.mockClear();
  spies.ensureCanReadMedia.mockClear();
  spies.getObject.mockClear();
});

describe("SEC-10 · валидный токен без прав больше не отдаёт файл", () => {
  it("ACL запрещает → файл НЕ читается из хранилища", async () => {
    state.aclAllows = false;
    const res = await call();
    expect(res.status).toBe(403);
    expect(spies.getObject).not.toHaveBeenCalled();
  });

  it("сессии нет → ACL всё равно спрашивается (решение принимает он, не ветка)", async () => {
    state.sessionUser = null;
    state.aclAllows = false;
    const res = await call();
    expect(res.status).toBe(403);
    expect(spies.ensureCanReadMedia).toHaveBeenCalledWith(
      null,
      MediaEntityType.MODEL_APPLICATION,
      "app1",
      MediaKind.MODEL_APPLICATION_PHOTO,
    );
  });

  it("невалидный токен → 401 и до сессии дело не доходит", async () => {
    state.tokenValid = false;
    const res = await call();
    expect(res.status).toBe(401);
    expect(spies.getSessionUser).not.toHaveBeenCalled();
    expect(spies.getObject).not.toHaveBeenCalled();
  });
});

describe("SEC-10 · легитимный кабинетный флоу не сломан", () => {
  it("валидный токен + разрешающий ACL → 200 и файл отдаётся", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(spies.getSessionUser).toHaveBeenCalledTimes(1);
    expect(spies.ensureCanReadMedia).toHaveBeenCalledTimes(1);
    expect(spies.getObject).toHaveBeenCalledTimes(1);
  });
});
