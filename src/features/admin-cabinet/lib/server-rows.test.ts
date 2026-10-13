import { describe, expect, it } from "vitest";
import { flattenServerPages, mergeServerPage, type ServerPage } from "./server-rows";

type Row = { id: string };

const page = (cursor: string | null, ...ids: string[]): ServerPage<Row> => ({
  cursor,
  rows: ids.map((id) => ({ id })),
});

const ids = (pages: ServerPage<Row>[]) => flattenServerPages(pages).map((r) => r.id);

// UX-PASS-01: списки админки держали строки первой загрузки — фильтры,
// «Загрузить ещё» и refresh не меняли таблицу. Правило слияния страниц.
describe("mergeServerPage", () => {
  it("«Загрузить ещё»: новый курсор дописывает страницу", () => {
    const next = mergeServerPage([page(null, "a", "b")], page("b", "c", "d"), false);
    expect(ids(next)).toEqual(["a", "b", "c", "d"]);
  });

  it("смена фильтров начинает список заново", () => {
    const next = mergeServerPage([page(null, "a"), page("a", "b")], page(null, "x"), true);
    expect(ids(next)).toEqual(["x"]);
  });

  it("refresh последней страницы заменяет её, а не дописывает", () => {
    const next = mergeServerPage([page(null, "a", "b"), page("b", "c")], page("b", "c2"), false);
    expect(ids(next)).toEqual(["a", "b", "c2"]);
  });

  it("возврат к первой странице отбрасывает подгруженные после неё", () => {
    const next = mergeServerPage([page(null, "a"), page("a", "b")], page(null, "a", "z"), false);
    expect(ids(next)).toEqual(["a", "z"]);
  });

  it("строка на стыке страниц показывается один раз", () => {
    expect(ids([page(null, "a", "b"), page("b", "b", "c")])).toEqual(["a", "b", "c"]);
  });
});
