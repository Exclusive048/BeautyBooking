import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { loadPortfolioMediaView } from "@/lib/media/portfolio-display";
import { parseMediaFileAssetId } from "@/lib/media/types";

/**
 * PORTFOLIO-CROP-01 — работа показывается вырезом, выбранным мастером, а
 * `PortfolioItem.mediaUrl` остаётся ссылкой на исходник.
 *
 * @probe 2026-10-13 — в `loadPortfolioMediaView` `displayUrl` вернул
 *        `mediaUrl` всегда (прежнее поведение — «обрезка не применяется»):
 *        красный кейс «вырезанное фото — ссылка выреза», «expected
 *        '/api/media/file/a1' to be '/api/media/file/a1/crop/1000-0-6000-10000'».
 *        Возвращено — зелёный.
 */

type Row = { id: string; cropX: number | null; cropY: number | null; cropWidth: number | null; cropHeight: number | null };

function fakeClient(rows: Row[]) {
  const findMany = vi.fn(async (args: { where: { id: { in: string[] } } }) =>
    rows.filter((row) => args.where.id.in.includes(row.id)),
  );
  return { client: { mediaAsset: { findMany } } as never, findMany };
}

const CROPPED: Row = { id: "a1", cropX: 0.1, cropY: 0, cropWidth: 0.6, cropHeight: 1 };
const PLAIN: Row = { id: "a2", cropX: null, cropY: null, cropWidth: null, cropHeight: null };

describe("loadPortfolioMediaView", () => {
  it("вырезанное фото — ссылка выреза, без области — исходник", async () => {
    const { client } = fakeClient([CROPPED, PLAIN]);
    const view = await loadPortfolioMediaView(["/api/media/file/a1", "/api/media/file/a2"], client);
    expect(view.displayUrl("/api/media/file/a1")).toBe("/api/media/file/a1/crop/1000-0-6000-10000");
    expect(view.displayUrl("/api/media/file/a2")).toBe("/api/media/file/a2");
    expect(view.cropOf("/api/media/file/a1")).toEqual({ x: 0.1, y: 0, width: 0.6, height: 1 });
    expect(view.cropOf("/api/media/file/a2")).toBeNull();
  });

  it("ссылка без ассета (сиды, старое хранилище) возвращается как есть", async () => {
    const { client } = fakeClient([CROPPED]);
    const external = "https://storage.yandexcloud.net/bucket/photo.jpg";
    const view = await loadPortfolioMediaView([external, "/api/media/file/gone"], client);
    expect(view.displayUrl(external)).toBe(external);
    expect(view.displayUrl("/api/media/file/gone")).toBe("/api/media/file/gone");
    expect(view.cropOf(external)).toBeNull();
  });

  it("один запрос на выдачу, повторы схлопнуты; без ссылок на ассеты — ни одного", async () => {
    const { client, findMany } = fakeClient([CROPPED, PLAIN]);
    await loadPortfolioMediaView(["/api/media/file/a1", "/api/media/file/a1?mt=x", "/api/media/file/a2"], client);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0].where.id.in).toEqual(["a1", "a2"]);

    const empty = fakeClient([]);
    const view = await loadPortfolioMediaView(["https://example.com/x.jpg"], empty.client);
    expect(empty.findMany).not.toHaveBeenCalled();
    expect(view.displayUrl("https://example.com/x.jpg")).toBe("https://example.com/x.jpg");
  });
});

describe("parseMediaFileAssetId", () => {
  it("исходник — относительный и абсолютный, с query", () => {
    expect(parseMediaFileAssetId("/api/media/file/abc_1-2")).toBe("abc_1-2");
    expect(parseMediaFileAssetId("https://masterryadom.ru/api/media/file/abc?w=320")).toBe("abc");
    expect(parseMediaFileAssetId(" /api/media/file/abc/ ")).toBe("abc");
  });

  it("ссылка выреза и чужие формы — не исходник", () => {
    expect(parseMediaFileAssetId("/api/media/file/abc/crop/1-2-3-4")).toBeNull();
    expect(parseMediaFileAssetId("/uploads/abc.jpg")).toBeNull();
    expect(parseMediaFileAssetId("https://storage.yandexcloud.net/b/api/media/file/abc")).toBeNull();
  });
});
