import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-22 — два чтения росли вместе с объёмом данных пользователя, хотя
 * отвечали на вопрос фиксированного размера:
 *
 *   1. публичная страница мастера тянула ВЕСЬ список избранного, чтобы
 *      ответить «избран ли ЭТОТ мастер» (один булев ответ);
 *   2. кабинетный список избранного тянул ВСЕ публичные in-search работы всех
 *      избранных мастеров, чтобы оставить по одной на мастера.
 *
 * Пин держит обе формы: вопрос задаётся точечно, а не выборкой с последующим
 * отбрасыванием. Оба теста краснеют, если вернуть прежние запросы.
 */

const prismaMock = vi.hoisted(() => ({
  userFavorite: { findUnique: vi.fn(), findMany: vi.fn() },
  portfolioItem: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// `React.cache` в node-окружении vitest не нужен как кэш — важна только
// прозрачность обёртки.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

import { isProviderFavorited } from "@/lib/favorites/get-favorites";

describe("PERF-22 · вопрос задаётся точечно, а не выборкой всего списка", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("«избран ли этот мастер» — одна строка по составному уникальному ключу", async () => {
    prismaMock.userFavorite.findUnique.mockResolvedValue({ id: "fav_1" });

    await expect(isProviderFavorited("user_1", "prov_1")).resolves.toBe(true);

    expect(prismaMock.userFavorite.findUnique).toHaveBeenCalledWith({
      where: { userId_providerId: { userId: "user_1", providerId: "prov_1" } },
      select: { id: true },
    });
    // Ключевая половина: список избранного не читается вообще.
    expect(prismaMock.userFavorite.findMany).not.toHaveBeenCalled();
  });

  it("отсутствие строки — это `false`, а не ошибка", async () => {
    prismaMock.userFavorite.findUnique.mockResolvedValue(null);
    await expect(isProviderFavorited("user_1", "prov_2")).resolves.toBe(false);
  });

  /**
   * `getFirstPortfolioPhotos` — модуль-приватная функция внутри
   * `listFavoritesEnriched`, поэтому проверяется по исходнику: важно не «как
   * вызвана», а что «выбрать всё и отбросить лишнее» сюда не вернулось.
   * Форма запроса тут и есть предмет находки.
   */
  it("фото избранных берётся `DISTINCT ON`, а не выборкой всего портфолио", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "client-cabinet", "favorites.service.ts"),
      "utf8",
    );

    expect(source).toContain('SELECT DISTINCT ON ("masterId")');
    expect(source).not.toMatch(/prisma\.portfolioItem\.findMany/);
  });
});
