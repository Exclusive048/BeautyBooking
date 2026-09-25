import { describe, expect, it } from "vitest";
import {
  FEED_UPLOAD_WINDOW_HOURS,
  compareFeedOrder,
  decodeFeedPosition,
  encodeFeedPosition,
  groupByUploadWindow,
  pickGroupsForPage,
  type FeedWorkStamp,
} from "./upload-window";

/**
 * HOME-FEED-COLLAGE — правило «работы автора в пределах 48 часов — одна
 * карусель, позже — новая» и выбор групп для страницы ленты.
 *
 * @probe   что сломать (выполнено 2026-09-25, каждый раз с откатом байт в байт):
 *   1. якорь окна — от ПРЕДЫДУЩЕЙ работы, а не от первой
 *      (`windowStartMs = at` и в ветке присоединения) → 2 failed: «окно
 *      якорится от первой работы группы» (0/30/60 ч склеились в одну) и «новая
 *      загрузка не перекраивает сложившиеся группы»;
 *   2. `<` → `<=` в сравнении с окном → 1 failed: «ровно 48 часов — уже новая
 *      карусель»;
 *   3. в `pickGroupsForPage` выводить группу при ПЕРВОЙ встреченной работе, а
 *      не при самой свежей → 4 failed: «limit=1/2/3: каждая группа ровно один
 *      раз» (старший член уже выведенной группы выводил её повторно) и
 *      «проход без свежих работ групп отдаёт пустую страницу».
 */

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);

function work(id: string, authorId: string, hoursFromStart: number): FeedWorkStamp {
  return { id, authorId, createdAt: new Date(T0 + hoursFromStart * HOUR) };
}

function groupsOf(stamps: FeedWorkStamp[]): string[][] {
  const groupOf = groupByUploadWindow(stamps);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const stamp of [...stamps].sort(compareFeedOrder)) {
    const group = groupOf.get(stamp.id)!;
    if (seen.has(group.anchorId)) continue;
    seen.add(group.anchorId);
    out.push(group.memberIds);
  }
  return out;
}

describe("groupByUploadWindow — одна карусель на 48 часов", () => {
  it("окно — 48 часов", () => {
    expect(FEED_UPLOAD_WINDOW_HOURS).toBe(48);
  });

  it("работы автора в пределах 48 часов — одна группа, свежие раньше", () => {
    expect(groupsOf([work("a", "m1", 0), work("b", "m1", 5), work("c", "m1", 47)])).toEqual([
      ["c", "b", "a"],
    ]);
  });

  it("ровно 48 часов — уже новая карусель", () => {
    expect(groupsOf([work("a", "m1", 0), work("b", "m1", 48)])).toEqual([["b"], ["a"]]);
  });

  it("окно якорится от первой работы группы, а не от предыдущей", () => {
    // Цепочкой (каждая в 48 ч от предыдущей) все три слиплись бы в одну.
    expect(groupsOf([work("a", "m1", 0), work("b", "m1", 30), work("c", "m1", 60)])).toEqual([
      ["c"],
      ["b", "a"],
    ]);
  });

  it("новая загрузка не перекраивает сложившиеся группы", () => {
    const before = [work("a", "m1", 0), work("b", "m1", 30), work("c", "m1", 60)];
    const after = [...before, work("d", "m1", 100)];
    const groupsBefore = groupsOf(before);
    const groupsAfter = groupsOf(after);
    // «d» (100 ч) входит в группу «c» (якорь 60 ч), остальные не меняются.
    expect(groupsAfter).toEqual([["d", "c"], ["b", "a"]]);
    expect(groupsAfter.slice(1)).toEqual(groupsBefore.slice(1));
  });

  it("авторы не смешиваются, даже в одно время", () => {
    expect(groupsOf([work("a", "m1", 0), work("b", "m2", 1), work("c", "m1", 2)])).toEqual([
      ["c", "a"],
      ["b"],
    ]);
  });

  it("место группы — её самая свежая работа", () => {
    const groupOf = groupByUploadWindow([work("a", "m1", 0), work("b", "m1", 10)]);
    expect(groupOf.get("a")!.newestId).toBe("b");
    expect(groupOf.get("a")).toBe(groupOf.get("b"));
    expect(groupOf.get("a")!.anchorId).toBe("a");
  });
});

describe("pickGroupsForPage — группа выводится целиком и ровно один раз", () => {
  /** Симуляция пагинации: поток после курсора, как его вернёт запрос. */
  function paginate(stamps: FeedWorkStamp[], limit: number): string[][][] {
    const stream = [...stamps].sort(compareFeedOrder);
    const groupOf = groupByUploadWindow(stamps);
    const pages: string[][][] = [];
    let offset = 0;
    for (let guard = 0; guard < 100 && offset < stream.length; guard += 1) {
      const page = pickGroupsForPage({ scanned: stream.slice(offset), groupOf, limit });
      pages.push(page.groups.map((group) => group.memberIds));
      if (!page.lastScanned) break;
      offset = stream.indexOf(page.lastScanned) + 1;
    }
    return pages;
  }

  const feed = [
    work("a1", "m1", 0),
    work("a2", "m1", 20),
    work("b1", "m2", 21),
    work("a3", "m1", 70),
    work("c1", "m3", 71),
    work("b2", "m2", 72),
    work("a4", "m1", 73),
    work("c2", "m3", 200),
  ];

  it.each([1, 2, 3, 10])("limit=%i: каждая группа ровно один раз, без разрывов", (limit) => {
    const pages = paginate(feed, limit);
    const all = pages.flat();
    expect(all).toEqual(groupsOf(feed));
    for (const page of pages.slice(0, -1)) {
      expect(page.length).toBeLessThanOrEqual(limit);
    }
  });

  it("старые члены уже выведенной группы пропускаются, но курсор идёт дальше", () => {
    const groupOf = groupByUploadWindow(feed);
    const stream = [...feed].sort(compareFeedOrder);
    // Начинаем сразу после «a4»: «a3» — член уже выведенной группы (a4, a3).
    const start = stream.findIndex((stamp) => stamp.id === "a4") + 1;
    const page = pickGroupsForPage({ scanned: stream.slice(start), groupOf, limit: 1 });
    expect(page.groups.map((group) => group.memberIds)).toEqual([["b2"]]);
    expect(page.reachedLimit).toBe(true);
  });

  it("проход без свежих работ групп отдаёт пустую страницу и позицию", () => {
    const groupOf = groupByUploadWindow([work("x", "m9", 0), work("y", "m9", 1)]);
    const page = pickGroupsForPage({ scanned: [work("x", "m9", 0)], groupOf, limit: 5 });
    expect(page.groups).toEqual([]);
    expect(page.lastScanned?.id).toBe("x");
    expect(page.reachedLimit).toBe(false);
  });
});

describe("порядок и курсор", () => {
  it("порядок — createdAt DESC, id ASC (как в запросе)", () => {
    const sorted = [work("b", "m", 0), work("a", "m", 0), work("c", "m", 1)].sort(compareFeedOrder);
    expect(sorted.map((stamp) => stamp.id)).toEqual(["c", "a", "b"]);
  });

  it("позиция курсора переживает кодирование", () => {
    const stamp = work("clx9abc", "m", 3);
    expect(decodeFeedPosition(encodeFeedPosition(stamp))).toEqual({
      createdAt: stamp.createdAt,
      id: "clx9abc",
    });
  });

  it.each(["", "abc", ":id", "12:", "-5:id", "1.5:id"])("мусор «%s» — не позиция", (raw) => {
    expect(decodeFeedPosition(raw)).toBeNull();
  });
});
