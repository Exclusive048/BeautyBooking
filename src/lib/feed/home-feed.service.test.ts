import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HOME-FEED-COLLAGE — сервис ленты главной против БД в памяти: запросы
 * исполняются по-настоящему (позиция курсора, фильтр авторов, выборка по id),
 * поэтому проверяется сама пагинация, а не то, как её вызвали.
 *
 * @probe   что сломать (выполнено 2026-09-25, с откатом байт в байт — md5):
 *   1. убрать из `afterPositionWhere` ветку равного времени
 *      (`createdAt = t AND id > id`) → 1 failed: «две работы в одну
 *      миллисекунду не теряются на стыке страниц»;
 *   2. грузить историю автора только из текущего прохода (`id IN` работ
 *      прохода в запросе истории) → красные «limit=1/2/4: все группы ровно
 *      один раз» и «граница группы не зависит от страницы»: группа, чья первая
 *      работа лежит за пределами прохода, резалась надвое;
 *   3. `hasMore` после набранной страницы — «в проходе ещё что-то есть»
 *      (`lastIndex < scanned.length - 1`) вместо «есть свежая работа группы»
 *      → 1 failed: «хвост из старших членов выведенной группы не даёт лишней
 *      пустой страницы».
 */

type FakeRow = {
  id: string;
  masterId: string;
  createdAt: Date;
  isPublic: boolean;
  mediaUrl: string;
  caption: string | null;
  performerId: string | null;
  master: { id: string; name: string; publicUsername: string | null; ratingAvg: number };
  performer: { name: string } | null;
  services: Array<{
    service: { id: string; name: string; title: string | null; price: number; durationMin: number };
  }>;
};

const db = vi.hoisted(() => ({ rows: [] as unknown[], favorites: [] as unknown[] }));
const findManyCalls = vi.hoisted(() => [] as unknown[]);
const userFavoriteFindMany = vi.hoisted(() => vi.fn());

type Where = {
  isPublic?: boolean;
  master?: unknown;
  masterId?: { in: string[] };
  id?: { in: string[] };
  OR?: Array<{ createdAt: Date | { lt: Date }; id?: { gt: string } }>;
};

function applyWhere(rows: FakeRow[], where: Where): FakeRow[] {
  return rows.filter((row) => {
    if (where.isPublic !== undefined && row.isPublic !== where.isPublic) return false;
    if (where.masterId && !where.masterId.in.includes(row.masterId)) return false;
    if (where.id && !where.id.in.includes(row.id)) return false;
    if (where.OR) {
      const matches = where.OR.some((clause) => {
        if (clause.createdAt instanceof Date) {
          return (
            row.createdAt.getTime() === clause.createdAt.getTime() &&
            (!clause.id || row.id > clause.id.gt)
          );
        }
        return row.createdAt.getTime() < clause.createdAt.lt.getTime();
      });
      if (!matches) return false;
    }
    return true;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portfolioItem: {
      findMany: vi.fn(async (args: { where: Where; orderBy?: unknown; take?: number }) => {
        findManyCalls.push(args);
        let rows = applyWhere(db.rows as FakeRow[], args.where);
        if (args.orderBy) {
          rows = [...rows].sort((a, b) => {
            const byTime = b.createdAt.getTime() - a.createdAt.getTime();
            if (byTime !== 0) return byTime;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          });
        }
        return args.take !== undefined ? rows.slice(0, args.take) : rows;
      }),
    },
    userFavorite: { findMany: userFavoriteFindMany },
    masterService: { findMany: vi.fn(async () => []) },
  },
}));

import { listHomeFeedGroups, type HomeFeedGroup } from "./home-feed.service";
import { catalogVisibleProviderWhere } from "@/lib/providers/catalog-visibility";

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);

function author(id: string) {
  return { id, name: `Автор ${id}`, publicUsername: `user-${id}`, ratingAvg: 4.8 };
}

function row(id: string, masterId: string, hours: number, extra: Partial<FakeRow> = {}): FakeRow {
  return {
    id,
    masterId,
    createdAt: new Date(T0 + hours * HOUR),
    isPublic: true,
    mediaUrl: `/api/media/file/${id}`,
    caption: null,
    performerId: null,
    master: author(masterId),
    performer: null,
    services: [
      { service: { id: `svc-${masterId}`, name: "Маникюр", title: null, price: 250000, durationMin: 60 } },
    ],
    ...extra,
  };
}

async function readAll(limit: number, currentUserId?: string): Promise<HomeFeedGroup[][]> {
  const pages: HomeFeedGroup[][] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await listHomeFeedGroups({ limit, cursor, currentUserId });
    pages.push(page.groups);
    if (!page.nextCursor) return pages;
    cursor = page.nextCursor;
  }
  throw new Error("лента не закончилась за 50 страниц");
}

function memberCaptions(groups: HomeFeedGroup[]): string[][] {
  return groups.map((group) => group.works.map((work) => work.mediaUrl.split("/").pop()!));
}

beforeEach(() => {
  findManyCalls.length = 0;
  userFavoriteFindMany.mockReset();
  userFavoriteFindMany.mockResolvedValue([]);
  db.rows = [
    row("a1", "m1", 0),
    row("a2", "m1", 20),
    row("b1", "m2", 21),
    row("a3", "m1", 70),
    row("c1", "m3", 71),
    row("b2", "m2", 72),
    row("a4", "m1", 73),
    row("c2", "m3", 200),
    row("hidden", "m1", 74, { isPublic: false }),
  ];
});

const EXPECTED = [["c2"], ["a4", "a3"], ["b2"], ["c1"], ["b1"], ["a2", "a1"]];

describe("listHomeFeedGroups — пагинация по группам", () => {
  it.each([1, 2, 4, 30])("limit=%i: все группы ровно один раз, целиком и по порядку", async (limit) => {
    const pages = await readAll(limit);
    expect(memberCaptions(pages.flat())).toEqual(EXPECTED);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(limit);
  });

  it("граница группы не зависит от страницы: история автора читается целиком", async () => {
    // limit=1 → проход в 4 работы: «new», f5, f4, f3. Якорь группы «new» —
    // «old» (40 ч назад) — в проход не попадает и приходит только из истории.
    db.rows = [
      row("old", "m1", 0),
      ...[1, 2, 3, 4, 5].map((h) => row(`f${h}`, `other-${h}`, h)),
      row("new", "m1", 40),
    ];
    const first = await listHomeFeedGroups({ limit: 1 });
    expect(memberCaptions(first.groups)).toEqual([["new", "old"]]);
  });

  it("две работы в одну миллисекунду не теряются на стыке страниц", async () => {
    db.rows = [row("x1", "m1", 0), row("y1", "m2", 0), row("z1", "m3", 0)];
    const pages = await readAll(1);
    expect(memberCaptions(pages.flat())).toEqual([["x1"], ["y1"], ["z1"]]);
  });

  it("скрытые работы и невидимые авторы не сканируются", async () => {
    await listHomeFeedGroups({ limit: 30 });
    const scans = findManyCalls.filter(
      (call) => !(call as { where: Where }).where.id,
    ) as Array<{ where: Where }>;
    expect(scans.length).toBeGreaterThan(0);
    for (const scan of scans) {
      expect(scan.where.isPublic).toBe(true);
      expect(scan.where.master).toEqual(catalogVisibleProviderWhere());
    }
  });

  it("хвост из старших членов выведенной группы не даёт лишней пустой страницы", async () => {
    db.rows = [row("n1", "m1", 0), row("n2", "m1", 1), row("n3", "m1", 2), row("o1", "m2", 100)];
    const first = await listHomeFeedGroups({ limit: 1 });
    expect(memberCaptions(first.groups)).toEqual([["o1"]]);
    const second = await listHomeFeedGroups({ limit: 1, cursor: first.nextCursor! });
    expect(memberCaptions(second.groups)).toEqual([["n3", "n2", "n1"]]);
    expect(second.nextCursor).toBeNull();
  });

  it("непонятный курсор — лента с начала", async () => {
    const page = await listHomeFeedGroups({ limit: 1, cursor: "не-курсор" });
    expect(memberCaptions(page.groups)).toEqual([["c2"]]);
  });

  it("пустая лента — пустая страница без курсора", async () => {
    db.rows = [];
    expect(await listHomeFeedGroups({ limit: 5 })).toEqual({ groups: [], nextCursor: null });
  });
});

describe("listHomeFeedGroups — избранное и rule 12", () => {
  it("отметка «в избранном» — по автору и только для смотрящего", async () => {
    userFavoriteFindMany.mockResolvedValue([{ providerId: "m1" }]);
    const groups = (await readAll(30, "viewer-1")).flat();
    const byAuthor = new Map(groups.map((group) => [group.authorPublicUsername, group.authorFavorited]));
    expect(byAuthor.get("user-m1")).toBe(true);
    expect(byAuthor.get("user-m2")).toBe(false);
    expect(userFavoriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "viewer-1" }) }),
    );
  });

  it("гостю избранное не читается", async () => {
    const groups = (await readAll(30)).flat();
    expect(groups.every((group) => group.authorFavorited === false)).toBe(true);
    expect(userFavoriteFindMany).not.toHaveBeenCalled();
  });

  it("наружу не уходят внутренние id работ и авторов", async () => {
    const page = await listHomeFeedGroups({ limit: 30 });
    for (const group of page.groups) {
      expect(group.key.startsWith("e_")).toBe(true);
      for (const work of group.works) expect(work.id.startsWith("e_")).toBe(true);
      expect(Object.keys(group)).not.toContain("authorId");
    }
    // Ссылка на файл несёт id медиа-актива — это публичный адрес, его не судим.
    const payload = JSON.stringify(
      page.groups.map((group) => ({
        ...group,
        works: group.works.map((work) => ({ ...work, mediaUrl: "" })),
      })),
    );
    for (const internal of ["a1", "m1", "m2", "m3"]) {
      expect(payload).not.toContain(`"${internal}"`);
    }
  });
});
