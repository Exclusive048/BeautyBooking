/**
 * 29.09 доработки · 20 (PERF-01, вариант C) — логотип шапки из кэша.
 *
 * Шапка стоит на каждой странице; до кэша каждый просмотр делал 2 запроса к БД
 * (настройка + актив) ради ссылки, которая меняется раз в месяцы. Проверяется
 * поведение (сколько раз ходим в Prisma), а не форма кода: второй просмотр — ноль
 * запросов, «логотипа нет» тоже кэшируется, сброс возвращает чтение из БД.
 *
 * Вторая половина — полнота сброса: каждая запись настройки картинки сайта в
 * `lib/media/service.ts` (upsert при загрузке) обязана в том же блоке звать
 * `invalidateSiteAssetCache` — иначе новый логотип появится только через TTL.
 * Разбор компилятором; ключ определяется по имени константы в `where.key`.
 *
 * @probe 2026-09-30: убран `await invalidateSiteAssetCache()` после upsert
 *   логотипа в `uploadMediaAsset` → красный «upsert SITE_LOGO_SETTING_KEY без
 *   invalidateSiteAssetCache (строка 584)»; убрано `writeSiteAssetCache` из
 *   `getSiteAssetBySettingKey` → красный «второй просмотр: запросов к БД 2».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, appSettingFindUnique, mediaAssetFindUnique } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  appSettingFindUnique: vi.fn(),
  mediaAssetFindUnique: vi.fn(),
}));

vi.mock("@/lib/cache/cache", () => ({
  get: async (key: string) => (store.has(key) ? store.get(key) : null),
  set: async (key: string, value: unknown) => {
    store.set(key, value);
  },
  del: async (key: string) => {
    store.delete(key);
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: { findUnique: appSettingFindUnique },
    mediaAsset: { findUnique: mediaAssetFindUnique },
  },
}));
vi.mock("@/lib/media/service", () => ({ getAvatarUrlForEntity: vi.fn() }));

import { getLoginHeroImageAsset, getSiteLogoAsset } from "@/lib/media/queries";
import { invalidateSiteAssetCache } from "@/lib/media/site-asset-cache";

const LOGO_ASSET = {
  id: "asset-logo",
  deletedAt: null,
  kind: "AVATAR",
  entityType: "SITE",
  entityId: "site",
  status: "READY",
  cropX: null,
  cropY: null,
  cropWidth: null,
  cropHeight: null,
};

const dbCalls = () => appSettingFindUnique.mock.calls.length + mediaAssetFindUnique.mock.calls.length;

describe("кэш картинок сайта", () => {
  beforeEach(() => {
    store.clear();
    appSettingFindUnique.mockReset();
    mediaAssetFindUnique.mockReset();
  });

  it("второй просмотр шапки не ходит в БД", async () => {
    appSettingFindUnique.mockResolvedValue({ value: "asset-logo" });
    mediaAssetFindUnique.mockResolvedValue(LOGO_ASSET);

    const first = await getSiteLogoAsset();
    expect(first?.url).toContain("asset-logo");
    expect(dbCalls()).toBe(2);

    const second = await getSiteLogoAsset();
    expect(second).toEqual(first);
    expect(dbCalls(), "второй просмотр: запросов к БД").toBe(2);
  });

  it("«логотипа нет» тоже кэшируется, а не читается каждый раз", async () => {
    appSettingFindUnique.mockResolvedValue(null);
    expect(await getSiteLogoAsset()).toBeNull();
    expect(await getSiteLogoAsset()).toBeNull();
    expect(dbCalls()).toBe(1);
  });

  it("сброс возвращает чтение из БД — и для логотипа, и для экрана входа", async () => {
    appSettingFindUnique.mockResolvedValue(null);
    await getSiteLogoAsset();
    await getLoginHeroImageAsset();
    expect(dbCalls()).toBe(2);

    await invalidateSiteAssetCache();
    appSettingFindUnique.mockResolvedValue({ value: "asset-logo" });
    mediaAssetFindUnique.mockResolvedValue(LOGO_ASSET);
    expect((await getSiteLogoAsset())?.url).toContain("asset-logo");
    await getLoginHeroImageAsset();
    expect(dbCalls()).toBe(2 + 2 + 2);
  });
});

describe("сброс кэша при смене картинки сайта (media/service.ts)", () => {
  const file = join(process.cwd(), "src", "lib", "media", "service.ts");
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const SITE_KEYS = new Set(["SITE_LOGO_SETTING_KEY", "SITE_LOGIN_HERO_SETTING_KEY"]);

  function upsertKey(call: ts.CallExpression): string | null {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "upsert") return null;
    if (!callee.expression.getText(sf).endsWith("appSetting")) return null;
    const arg = call.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
    const where = arg.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === "where");
    if (!where || !ts.isPropertyAssignment(where) || !ts.isObjectLiteralExpression(where.initializer)) return null;
    const key = where.initializer.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === "key");
    return key && ts.isPropertyAssignment(key) ? key.initializer.getText(sf) : null;
  }

  function enclosingBlock(node: ts.Node): ts.Block | null {
    for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) if (ts.isBlock(cur)) return cur;
    return null;
  }

  it("каждый upsert настройки картинки сайта сбрасывает кэш в том же блоке", () => {
    const found: string[] = [];
    const violations: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const key = upsertKey(node);
        if (key && SITE_KEYS.has(key)) {
          found.push(key);
          const block = enclosingBlock(node);
          const resets = block?.getText(sf).includes("invalidateSiteAssetCache(") ?? false;
          if (!resets) {
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            violations.push(`upsert ${key} без invalidateSiteAssetCache (строка ${line})`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(found.sort(), "обход нашёл запись обеих настроек").toEqual(["SITE_LOGIN_HERO_SETTING_KEY", "SITE_LOGO_SETTING_KEY"]);
    expect(violations).toEqual([]);
  });

  it("мягкое удаление и новая область обрезки актива сайта тоже сбрасывают", () => {
    const text = sf.getText();
    const fnBody = (name: string) => {
      const start = text.indexOf(`export async function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const next = text.indexOf("\nexport async function ", start + 1);
      return text.slice(start, next === -1 ? undefined : next);
    };
    expect(fnBody("deleteAssetById")).toMatch(/entityType === MediaEntityType\.SITE\) await invalidateSiteAssetCache\(\)/);
    expect(fnBody("updateMediaCrop")).toMatch(/entityType === MediaEntityType\.SITE\) await invalidateSiteAssetCache\(\)/);
  });
});
