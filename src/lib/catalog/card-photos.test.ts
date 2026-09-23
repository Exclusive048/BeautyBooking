/**
 * CATALOG-CARD-CAROUSEL — порядок групп сохраняется (главное фото первым),
 * повторы и пустые ссылки выпадают, лимит карточки соблюдается.
 *
 * @probe 2026-09-23 — `composeCardPhotos` собирал группы в обратном порядке:
 * красный «первая группа идёт первой». Убирал проверку повторов: красный
 * «повтор из второй группы не дублируется». Возвращено — зелёный.
 */
import { describe, expect, it } from "vitest";
import { CARD_PHOTO_LIMIT, composeCardPhotos } from "./card-photos";

describe("composeCardPhotos", () => {
  it("первая группа идёт первой — главное фото студии раньше работ мастеров", () => {
    expect(composeCardPhotos(["studio-cover", "studio-2"], ["master-1"])).toEqual([
      "studio-cover",
      "studio-2",
      "master-1",
    ]);
  });

  it("повтор из второй группы не дублируется, пустые ссылки выпадают", () => {
    expect(composeCardPhotos(["a", "", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("не больше лимита карточки", () => {
    const many = Array.from({ length: CARD_PHOTO_LIMIT + 5 }, (_, i) => `p${i}`);
    expect(composeCardPhotos(many)).toHaveLength(CARD_PHOTO_LIMIT);
    expect(composeCardPhotos(many)[0]).toBe("p0");
  });

  it("без фото — пустой список (карточка рисует заглушку)", () => {
    expect(composeCardPhotos([], [])).toEqual([]);
  });
});
