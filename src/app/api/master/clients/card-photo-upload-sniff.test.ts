import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";

/**
 * SEC-06 (уровень роута) — не-картинка не доезжает до хранилища.
 *
 * Примитив `readValidatedImageUpload` покрыт своими тестами, а source-guard
 * проверяет, что роуты его зовут. Здесь проверяется третье, чего ни один из
 * них не показывает: что отказ примитива доходит до клиента как чистый 415, а
 * не как 500 из общего catch, и что `uploadMediaAsset` при этом не вызывается
 * вообще — то есть в хранилище ничего не попадает даже временно.
 */

const spies = vi.hoisted(() => ({
  // rest-сигнатура нужна, чтобы читать второй аргумент вызова в ассерте ниже
  uploadMediaAsset: vi.fn(async (...args: unknown[]) => {
    void args;
    return { id: "asset1" };
  }),
  photoCreate: vi.fn(async () => ({
    id: "photo1",
    caption: null,
    createdAt: new Date("2026-08-05T10:00:00Z"),
    mediaAssetId: "asset1",
  })),
  photoCount: vi.fn(async () => 0),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => ({ id: "u1", roles: ["MASTER"] })),
}));
vi.mock("@/lib/master/access", () => ({
  getCurrentMasterProviderId: vi.fn(async () => "prov1"),
}));
vi.mock("@/lib/billing/get-current-plan", () => ({
  getCurrentPlan: vi.fn(async () => ({ features: { clientCards: true } })),
}));
vi.mock("@/lib/crm/guards", () => ({ ensureClientCardAccess: vi.fn() }));
vi.mock("@/lib/crm/card-service", () => ({
  ensureClientCard: vi.fn(async () => ({ id: "card1" })),
}));
vi.mock("@/lib/media/service", () => ({ uploadMediaAsset: spies.uploadMediaAsset }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientCardPhoto: { count: spies.photoCount, create: spies.photoCreate },
  },
}));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { POST } from "@/app/api/master/clients/[clientKey]/card/photos/route";

function upload(bytes: Buffer, claimedType: string, filename = "photo.png"): Request {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], filename, { type: claimedType }));
  return new Request("http://localhost/api/master/clients/ck1/card/photos", {
    method: "POST",
    body: form,
  });
}

function ctx() {
  return { params: Promise.resolve({ clientKey: "ck1" }) };
}

beforeEach(() => {
  spies.uploadMediaAsset.mockClear();
  spies.photoCreate.mockClear();
});

describe("SEC-06 · POST /api/master/clients/[clientKey]/card/photos", () => {
  it("HTML под видом image/png → 415, в хранилище ничего не уходит", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
    const res = await POST(upload(html, "image/png"), ctx());

    expect(res.status).toBe(415);
    expect(JSON.stringify(await res.json())).toContain("MEDIA_INVALID_MIME");
    expect(spies.uploadMediaAsset).not.toHaveBeenCalled();
    expect(spies.photoCreate).not.toHaveBeenCalled();
  });

  it("настоящий PNG → 201, а в хранилище уходит тип из БАЙТОВ и размер после переупаковки", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    // клиент заявляет заведомо неверный тип — роут обязан его игнорировать
    const res = await POST(upload(png, "text/html"), ctx());

    expect(res.status).toBe(201);
    expect(spies.uploadMediaAsset).toHaveBeenCalledTimes(1);
    const payload = spies.uploadMediaAsset.mock.calls[0]?.[1] as unknown as {
      mimeType: string;
      sizeBytes: number;
      bytes: Uint8Array;
    };
    expect(payload.mimeType).toBe("image/webp");
    expect(payload.sizeBytes).toBe(payload.bytes.byteLength);
    expect(payload.sizeBytes).not.toBe(png.byteLength);
  });
});
