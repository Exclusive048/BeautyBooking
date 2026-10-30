import { describe, expect, it } from "vitest";

import { bookingReadPath, manageTokenFromUrl } from "./url-state";

/**
 * PUBLIC-BOOKING-READ-TOKEN (SEC-11b): виджет читает карточку записи гостя по
 * токену из ссылки «Управлять записью», а вошедшей стороны — по id. Токен
 * уходит в ПУТЬ (как у остальных действий по ссылке), не в query.
 */
describe("manageTokenFromUrl", () => {
  it("достаёт токен из ссылки, которую отдаёт сервер", () => {
    expect(manageTokenFromUrl("/booking/manage/abc.DEF-_1")).toBe("abc.DEF-_1");
  });

  it("не принимает чужой путь, пустой токен и вложенные сегменты", () => {
    expect(manageTokenFromUrl("/cabinet/bookings")).toBeNull();
    expect(manageTokenFromUrl("/booking/manage/")).toBeNull();
    expect(manageTokenFromUrl("/booking/manage/a/b")).toBeNull();
  });

  it("отбрасывает query и фрагмент", () => {
    expect(manageTokenFromUrl("/booking/manage/tok?x=1#y")).toBe("tok");
  });
});

describe("bookingReadPath", () => {
  it("гость со ссылкой — дверь по токену, токен в пути", () => {
    expect(bookingReadPath("bk-1", "/booking/manage/tok.sig")).toBe(
      "/api/public/bookings/manage/tok.sig",
    );
  });

  it("без ссылки — дверь по id (ответит только сессии стороны брони)", () => {
    expect(bookingReadPath("bk-1", null)).toBe("/api/public/bookings/bk-1");
    expect(bookingReadPath("bk-1", "/somewhere/else")).toBe("/api/public/bookings/bk-1");
  });
});
