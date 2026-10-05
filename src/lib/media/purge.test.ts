import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaKind } from "@prisma/client";

const deleteObject = vi.fn();
const deleteMany = vi.fn();
const logError = vi.fn();
const logInfo = vi.fn();

vi.mock("@/lib/media/storage", () => ({ getStorageProvider: () => ({ deleteObject }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { mediaAsset: { deleteMany: (...a: unknown[]) => deleteMany(...a), findMany: vi.fn() } },
}));
vi.mock("@/lib/logging/logger", () => ({
  logError: (...a: unknown[]) => logError(...a),
  logInfo: (...a: unknown[]) => logInfo(...a),
}));

const { runMediaPurge, PURGEABLE_KINDS, POLICY_PENDING_KINDS } = await import("@/lib/media/purge");
const { MEDIA_PREVIEW_WIDTHS, mediaPreviewStorageKey } = await import("@/lib/media/preview-variants");

const payload = (assets: Array<{ id: string; storageKey: string }>) => ({
  assets,
  reason: "account-deletion" as const,
  actorUserId: "u1",
});

beforeEach(() => {
  deleteObject.mockReset().mockResolvedValue(undefined);
  deleteMany.mockReset().mockResolvedValue({ count: 1 });
  logError.mockReset();
  logInfo.mockReset();
});

describe("runMediaPurge", () => {
  it("удаляет объект в хранилище И строку", async () => {
    const res = await runMediaPurge(payload([{ id: "a1", storageKey: "k1" }]));
    expect(deleteObject).toHaveBeenCalledWith("k1");
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(res).toEqual({ objectsDeleted: 1, rowsDeleted: 1, failures: 0 });
  });

  it("ПОРЯДОК: объект (и его превью) раньше строки — иначе теряется указатель", async () => {
    const order: string[] = [];
    deleteObject.mockImplementation(async (key: string) => void order.push(key === "k1" ? "object" : "preview"));
    deleteMany.mockImplementation(async () => {
      order.push("row");
      return { count: 1 };
    });
    await runMediaPurge(payload([{ id: "a1", storageKey: "k1" }]));
    expect(order).toEqual(["object", ...MEDIA_PREVIEW_WIDTHS.map(() => "preview"), "row"]);
  });

  /**
   * MOBILE-B1 — превью `?w=` (`lib/media/preview-variants.ts`) — производные
   * байты того же фото (аватар — лицо): удаление аккаунта обязано их снести.
   *
   * @probe 2026-10-03 — из `runMediaPurge` убран вызов `deleteMediaPreviews`:
   *        красные оба кейса ниже. Возвращено — зелёный.
   */
  it("MOBILE-B1: удаляет и все превью актива — ключи из storageKey снимка", async () => {
    await runMediaPurge(payload([{ id: "a1", storageKey: "k1" }]));
    for (const width of MEDIA_PREVIEW_WIDTHS) {
      expect(deleteObject).toHaveBeenCalledWith(mediaPreviewStorageKey("k1", width));
    }
  });

  it("MOBILE-B1: превью не удалилось — актив провален, строка остаётся", async () => {
    deleteObject.mockImplementation(async (key: string) => {
      if (key === mediaPreviewStorageKey("k1", 320)) throw new Error("s3 down");
    });
    await expect(runMediaPurge(payload([{ id: "a1", storageKey: "k1" }]))).rejects.toThrow(
      /Media purge incomplete/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("при провале хранилища строку НЕ удаляет — она последний указатель на объект", async () => {
    deleteObject.mockRejectedValueOnce(new Error("s3 down"));
    await expect(runMediaPurge(payload([{ id: "a1", storageKey: "k1" }]))).rejects.toThrow(
      /Media purge incomplete/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });

  it("бросает при частичном провале → очередь ретраит, исчерпав — dead letter", async () => {
    deleteObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"));
    await expect(
      runMediaPurge(payload([{ id: "a1", storageKey: "k1" }, { id: "a2", storageKey: "k2" }])),
    ).rejects.toThrow(/1\/2/);
    // Успешная половина всё же доведена — повторный прогон доделает остаток.
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it("идемпотентна: повтор с теми же ключами безопасен (0 строк — не ошибка)", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    const res = await runMediaPurge(payload([{ id: "a1", storageKey: "k1" }]));
    expect(res.objectsDeleted).toBe(1);
    expect(res.rowsDeleted).toBe(0);
    expect(res.failures).toBe(0);
  });

  it("пустой список — no-op", async () => {
    const res = await runMediaPurge(payload([]));
    expect(deleteObject).not.toHaveBeenCalled();
    expect(res.objectsDeleted).toBe(0);
  });
});

describe("границы скоупа: что можно и что НЕЛЬЗЯ удалять", () => {
  it("удаляются только AVATAR и PORTFOLIO", () => {
    expect([...PURGEABLE_KINDS].sort()).toEqual([MediaKind.AVATAR, MediaKind.PORTFOLIO].sort());
  });

  it("policy-pending виды НЕ пересекаются с удаляемыми", () => {
    // Каждый из них едет за своей POLICY_PENDING-связью в карте диспозиций;
    // удалить их здесь значило бы решить за юриста (RKN-FIX-03-B).
    for (const kind of POLICY_PENDING_KINDS) {
      expect(PURGEABLE_KINDS.has(kind), `${kind} не должен удаляться в DELETION-02`).toBe(false);
    }
    expect([...POLICY_PENDING_KINDS].sort()).toEqual(
      [
        MediaKind.BOOKING_REFERENCE,
        MediaKind.CHAT_ATTACHMENT,
        MediaKind.CLIENT_CARD_PHOTO,
        MediaKind.MODEL_APPLICATION_PHOTO,
      ].sort(),
    );
  });

  it("каждый вид MediaKind классифицирован — новый вид не проскочит молча", () => {
    for (const kind of Object.values(MediaKind)) {
      const known = PURGEABLE_KINDS.has(kind) || POLICY_PENDING_KINDS.has(kind);
      expect(known, `MediaKind.${kind} не отнесён ни к удаляемым, ни к policy-pending`).toBe(true);
    }
  });
});
