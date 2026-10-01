import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEO-01 — robots и sitemap в проде.
 *
 * @probe 2026-10-01 — вернуть `allow: ["/", "/u/", "/c/"]` → красный
 *        «/api/og/ открыт для поисковиков».
 */

vi.mock("@/lib/env", () => ({ isProduction: true }));
vi.mock("@/lib/app-url", () => ({ resolvePublicAppUrl: () => "https://masterryadom.ru" }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findMany } } }));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

beforeEach(() => findMany.mockReset());

describe("robots", () => {
  it("кабинеты и API закрыты, превью профиля /api/og/ открыто, sitemap указан", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rule.allow).toContain("/api/og/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/cabinet/", "/admin/", "/booking/manage/"]));
    expect(rule.allow).not.toContain("/c/");
    expect(result.sitemap).toBe("https://masterryadom.ru/sitemap.xml");
  });
});

describe("sitemap", () => {
  it("статические страницы и опубликованные профили", async () => {
    findMany.mockResolvedValueOnce([{ id: "p1", publicUsername: "anna-sokolova", updatedAt: new Date("2026-09-30T00:00:00Z") }]);
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://masterryadom.ru/",
        "https://masterryadom.ru/catalog",
        "https://masterryadom.ru/consent",
        "https://masterryadom.ru/u/anna-sokolova",
      ]),
    );
    expect(urls).not.toContain("https://masterryadom.ru/blog");
    expect(urls).not.toContain("https://masterryadom.ru/careers");
  });
});
