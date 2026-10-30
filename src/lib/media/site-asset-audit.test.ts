/**
 * ADMIN-AUDIT-SITE-MEDIA — смена логотипа и фото страницы входа оставляет
 * строку `AdminAuditLog`.
 *
 * Обе настройки сайта меняются через общий `/api/media`, а не через
 * `/api/admin/*`, поэтому сторож `audit/admin-audit-coverage.test.ts` их не
 * видел, и значения `SETTINGS_LOGO_UPDATED` / `SETTINGS_LOGIN_HERO_UPDATED`
 * (с подписями в «Истории событий») не писал никто. Проверяется поведение
 * сервиса на двойнике Prisma: настройка и строка аудита пишутся в ОДНОЙ
 * транзакции (инв. #18), кэш шапки сбрасывается после неё, удаление снимает
 * настройку до пометки фото удалённым, фото не сайта аудита не пишут.
 *
 * @probe 2026-10-30 — вызов `auditSiteAssetChange` в загрузке вынесен из
 *   `$transaction` в обычный `await` после неё: покраснел «загрузка логотипа…»
 *   (строка аудита записана вне транзакции). Возвращено — зелёный.
 * @probe 2026-10-30 — в удалении снятие настройки поставлено после
 *   `deleteAssetById` (как было): покраснел «удаление текущего логотипа…»
 *   (порядок `soft-delete` раньше `setting:delete`). Возвращено — зелёный.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Event = { op: string; inTx: boolean; arg?: unknown };

const { events, state } = vi.hoisted(() => ({
  events: [] as Array<{ op: string; inTx: boolean; arg?: unknown }>,
  state: { inTx: false, asset: null as Record<string, unknown> | null, settingValue: null as string | null },
}));

function record(op: string, arg?: unknown) {
  events.push({ op, inTx: state.inTx, arg });
}

vi.mock("@/lib/prisma", () => {
  const client = {
    mediaAsset: {
      findUnique: vi.fn(async () => state.asset),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _sum: { sizeBytes: 0 } })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "new-asset",
        createdAt: new Date("2026-10-30T00:00:00Z"),
        updatedAt: new Date("2026-10-30T00:00:00Z"),
      })),
      update: vi.fn(async (arg: { where: { id: string }; data: Record<string, unknown> }) => {
        record(arg.data.deletedAt ? "soft-delete" : arg.data.cropX !== undefined ? "crop" : "update", arg);
        const base = { createdAt: new Date("2026-10-30T00:00:00Z"), updatedAt: new Date("2026-10-30T00:00:00Z") };
        return { ...base, ...state.asset, ...arg.data, id: arg.where.id };
      }),
      delete: vi.fn(),
    },
    mediaAssetEmbedding: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    appSetting: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (arg: { where: { key: string } }) => record(`setting:upsert:${arg.where.key}`, arg)),
      deleteMany: vi.fn(async (arg: { where: { key: string; value: string } }) => {
        record(`setting:delete:${arg.where.key}`, arg);
        return { count: state.settingValue === arg.where.value ? 1 : 0 };
      }),
    },
    systemConfig: {
      deleteMany: vi.fn(async (arg: { where: { key: string } }) => {
        record(`focal:clear:${arg.where.key}`, arg);
        return { count: 1 };
      }),
    },
    adminAuditLog: {
      create: vi.fn(async (arg: { data: Record<string, unknown> }) => {
        record("audit", arg.data);
        return arg.data;
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        state.inTx = true;
        try {
          return await (arg as (tx: unknown) => Promise<unknown>)(client);
        } finally {
          state.inTx = false;
        }
      }
      return Promise.all(arg as Array<Promise<unknown>>);
    }),
  };
  return { prisma: client };
});
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({ name: "test", putObject: vi.fn(), deleteObject: vi.fn() }),
}));
vi.mock("@/lib/media/preview-variants", () => ({ deleteMediaPreviews: vi.fn(async () => true) }));
vi.mock("@/lib/media/access", () => ({
  canManageProvider: vi.fn(),
  ensureCanManageMedia: vi.fn(),
  ensureCanReadMedia: vi.fn(),
}));
vi.mock("@/lib/media/site-asset-cache", () => ({
  invalidateSiteAssetCache: vi.fn(async () => record("cache:invalidate")),
}));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));
vi.mock("@/lib/billing/guards", () => ({ createLimitReachedError: vi.fn() }));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/feed/stories.service", () => ({ invalidateStoriesCache: vi.fn() }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: vi.fn(async () => undefined) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { MediaEntityType, MediaKind } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { deleteMediaAsset, updateMediaCrop, uploadMediaAsset } from "@/lib/media/service";
import {
  SITE_LOGIN_HERO_FOCAL_SETTING_KEY,
  SITE_LOGIN_HERO_SETTING_KEY,
  SITE_LOGO_FOCAL_SETTING_KEY,
  SITE_LOGO_SETTING_KEY,
} from "@/lib/media/settings";

const admin = { id: "admin-1", roles: ["ADMIN"] } as unknown as SessionUser;
const auditContext = { ipAddress: "203.0.113.7", userAgent: "probe" };

const SITE_CASES = [
  {
    name: "логотип",
    kind: MediaKind.AVATAR,
    settingKey: SITE_LOGO_SETTING_KEY,
    focalKey: SITE_LOGO_FOCAL_SETTING_KEY,
    action: "SETTINGS_LOGO_UPDATED",
  },
  {
    name: "фото страницы входа",
    kind: MediaKind.PORTFOLIO,
    settingKey: SITE_LOGIN_HERO_SETTING_KEY,
    focalKey: SITE_LOGIN_HERO_FOCAL_SETTING_KEY,
    action: "SETTINGS_LOGIN_HERO_UPDATED",
  },
] as const;

function siteAsset(kind: MediaKind, entityType: MediaEntityType = MediaEntityType.SITE) {
  return {
    id: "site-asset",
    entityType,
    entityId: entityType === MediaEntityType.SITE ? "site" : "provider-1",
    kind,
    storageKey: "site/site/key.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    createdByUserId: admin.id,
    deletedAt: null,
    status: "READY",
    cropX: null,
    cropY: null,
    cropWidth: null,
    cropHeight: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };
}

const ops = () => events.map((e) => e.op);
const audits = () => events.filter((e) => e.op === "audit");

beforeEach(() => {
  events.length = 0;
  state.inTx = false;
  state.asset = null;
  state.settingValue = null;
});

describe.each(SITE_CASES)("$name сайта", ({ kind, settingKey, focalKey, action }) => {
  it("загрузка: настройка, сброс фокуса и аудит — одной транзакцией, кэш после неё", async () => {
    await uploadMediaAsset(
      admin,
      {
        entityType: MediaEntityType.SITE,
        entityId: "site",
        kind,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        bytes: Buffer.from("x"),
        originalFilename: "logo.jpg",
      },
      { auditContext },
    );

    const txOps = events.filter((e) => e.inTx).map((e) => e.op);
    expect(txOps).toEqual([`setting:upsert:${settingKey}`, `focal:clear:${focalKey}`, "audit"]);
    expect(audits()).toHaveLength(1);
    expect(audits()[0].arg).toMatchObject({
      adminUserId: admin.id,
      action,
      targetType: "media",
      targetId: "new-asset",
      details: { operation: "upload" },
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });
    expect(ops().indexOf("cache:invalidate")).toBeGreaterThan(ops().indexOf("audit"));
  });

  it("удаление текущего: настройка снята в транзакции с аудитом ДО пометки фото удалённым", async () => {
    state.asset = siteAsset(kind);
    state.settingValue = "site-asset";

    await deleteMediaAsset(admin, "site-asset", { auditContext });

    const txOps = events.filter((e) => e.inTx).map((e) => e.op);
    expect(txOps).toEqual([`setting:delete:${settingKey}`, `focal:clear:${focalKey}`, "audit"]);
    expect(audits()[0].arg).toMatchObject({
      action,
      targetId: "site-asset",
      details: { operation: "delete", wasCurrent: true },
    });
    expect(ops().indexOf("soft-delete")).toBeGreaterThan(ops().indexOf("audit"));
  });

  it("удаление не текущего: фокус не трогается, аудит отмечает wasCurrent: false", async () => {
    state.asset = siteAsset(kind);
    state.settingValue = "other-asset";

    await deleteMediaAsset(admin, "site-asset");

    expect(ops()).not.toContain(`focal:clear:${focalKey}`);
    expect(audits()[0].arg).toMatchObject({ details: { operation: "delete", wasCurrent: false } });
  });

  it("обрезка: новая область и аудит — одной транзакцией, кэш сброшен", async () => {
    state.asset = siteAsset(kind);

    await updateMediaCrop(admin, "site-asset", { cropX: 0, cropY: 0, cropWidth: 0.5, cropHeight: 0.5 }, { auditContext });

    const txOps = events.filter((e) => e.inTx).map((e) => e.op);
    expect(txOps).toEqual(["crop", "audit"]);
    expect(audits()[0].arg).toMatchObject({ action, details: { operation: "crop" } });
    expect(ops()).toContain("cache:invalidate");
  });
});

describe("фото не сайта аудита админки не пишут", () => {
  it("обрезка работы мастера — без строки аудита и без транзакции", async () => {
    state.asset = siteAsset(MediaKind.PORTFOLIO, MediaEntityType.MASTER);

    await updateMediaCrop(admin, "site-asset", { cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 });

    expect(audits()).toEqual([]);
    expect(events.some((e: Event) => e.inTx)).toBe(false);
  });
});
