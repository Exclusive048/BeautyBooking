import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEO-ADMIN-01: заголовок и описание главной из админки.
 *
 * @probe 2026-10-12 — (1) в `usable` снята проверка длины (`return text ?
 *   text : null`): красный «длиннее предела — на сайте текст из кода»;
 *   (2) из `getSiteSeo` убран `try/catch`: красный «сбой базы не роняет
 *   страницу» — `promise rejected "Error: db down" instead of resolving`;
 *   (3) кэш не читается (`if (cached && false)`): красный «из кэша — без
 *   похода в базу» на `expect(findMany).not.toHaveBeenCalled()`. Возвращено —
 *   7/7 зелёные.
 */

const store = new Map<string, unknown>();
const findMany = vi.fn();
const logError = vi.fn();

vi.mock("@/lib/cache/cache", () => ({
  get: (key: string) => Promise.resolve(store.get(key) ?? null),
  set: (key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  },
  del: (key: string) => {
    store.delete(key);
    return Promise.resolve();
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { appSetting: { findMany: (...args: unknown[]) => findMany(...args) } } }));
vi.mock("@/lib/logging/logger", () => ({ logError: (...args: unknown[]) => logError(...args) }));

const { resolveSiteSeo, SITE_SEO_TITLE_MAX, SITE_SEO_DESCRIPTION_MAX } = await import("./site-seo-shared");
const { getSiteSeo, invalidateSiteSeoCache, SITE_SEO_DEFAULTS, SITE_SEO_KEYS } = await import("./site-seo");

const DEFAULTS = { title: "Заголовок из кода", description: "Описание из кода" };
const rows = (title: string | null, description: string | null) =>
  [
    title === null ? null : { key: SITE_SEO_KEYS.title, value: title },
    description === null ? null : { key: SITE_SEO_KEYS.description, value: description },
  ].filter(Boolean);

beforeEach(() => {
  store.clear();
  findMany.mockReset();
  logError.mockReset();
});

describe("resolveSiteSeo", () => {
  it("пустые и пробельные поля — текст из кода", () => {
    expect(resolveSiteSeo({ title: null, description: "  \n " }, DEFAULTS)).toEqual(DEFAULTS);
  });

  it("заполненное — из админки, пробелы и переводы строк схлопнуты", () => {
    expect(
      resolveSiteSeo({ title: " МастерРядом —  запись ", description: "Строка\nвторая" }, DEFAULTS),
    ).toEqual({ title: "МастерРядом — запись", description: "Строка вторая" });
  });

  it("длиннее предела — на сайте текст из кода, без обрезки", () => {
    const title = "а".repeat(SITE_SEO_TITLE_MAX + 1);
    const description = "б".repeat(SITE_SEO_DESCRIPTION_MAX + 1);
    expect(resolveSiteSeo({ title, description }, DEFAULTS)).toEqual(DEFAULTS);
    expect(resolveSiteSeo({ title: "а".repeat(SITE_SEO_TITLE_MAX), description: null }, DEFAULTS).title).toHaveLength(
      SITE_SEO_TITLE_MAX,
    );
  });

  it("текст из кода сам укладывается в пределы админки", () => {
    expect(SITE_SEO_DEFAULTS.title.length).toBeLessThanOrEqual(SITE_SEO_TITLE_MAX);
    expect(SITE_SEO_DEFAULTS.description.length).toBeLessThanOrEqual(SITE_SEO_DESCRIPTION_MAX);
  });
});

describe("getSiteSeo", () => {
  it("промах кэша — читает базу и кладёт в кэш", async () => {
    findMany.mockResolvedValue(rows("МастерРядом — запись к мастерам", null));
    await expect(getSiteSeo()).resolves.toEqual({
      title: "МастерРядом — запись к мастерам",
      description: SITE_SEO_DEFAULTS.description,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);
  });

  it("из кэша — без похода в базу; пустые настройки тоже кэшируются", async () => {
    findMany.mockResolvedValue([]);
    await getSiteSeo();
    await invalidateSiteSeoCache();
    expect(store.size).toBe(0);

    findMany.mockResolvedValue([]);
    await getSiteSeo();
    expect(store.size).toBe(1);
    findMany.mockClear();
    // `cache()` React вне рендера не мемоизирует — второй вызов идёт в кэш.
    await expect(getSiteSeo()).resolves.toEqual(SITE_SEO_DEFAULTS);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("сбой базы не роняет страницу — текст из кода", async () => {
    findMany.mockRejectedValue(new Error("db down"));
    await expect(getSiteSeo()).resolves.toEqual(SITE_SEO_DEFAULTS);
    expect(logError).toHaveBeenCalledWith("seo.site.read_failed", expect.anything());
  });
});
