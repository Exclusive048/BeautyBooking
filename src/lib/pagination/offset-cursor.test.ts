import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { encodeCursor } from "@/lib/pagination/cursor";
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  paginateByOffset,
  readOffsetCursor,
} from "./offset-cursor";

describe("offset-cursor", () => {
  it("курсор непрозрачен и обратим", () => {
    const cursor = encodeOffsetCursor(40);
    expect(cursor).not.toContain("40");
    expect(decodeOffsetCursor(cursor)).toBe(40);
  });

  it("чужой или испорченный курсор не разбирается", () => {
    expect(decodeOffsetCursor(encodeCursor("ckxyz123"))).toBeNull();
    expect(decodeOffsetCursor(encodeCursor("o:-1"))).toBeNull();
    expect(decodeOffsetCursor(encodeCursor("o:1e3"))).toBeNull();
    expect(decodeOffsetCursor("%%%")).toBeNull();
  });

  it("readOffsetCursor: без курсора — 0, испорченный — 400 VALIDATION_ERROR", () => {
    expect(readOffsetCursor(undefined)).toBe(0);
    expect(readOffsetCursor(encodeOffsetCursor(20))).toBe(20);
    try {
      readOffsetCursor(encodeCursor("ckxyz123"));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(400);
      expect((error as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("paginateByOffset: страницы до конца, на последней nextCursor = null", () => {
    const list = Array.from({ length: 5 }, (_, index) => index);
    const first = paginateByOffset(list, 0, 2);
    expect(first.items).toEqual([0, 1]);
    expect(first.total).toBe(5);
    const second = paginateByOffset(list, decodeOffsetCursor(first.nextCursor!)!, 2);
    expect(second.items).toEqual([2, 3]);
    const third = paginateByOffset(list, decodeOffsetCursor(second.nextCursor!)!, 2);
    expect(third).toEqual({ items: [4], nextCursor: null, total: 5 });
  });

  it("смещение за концом набора — пустая страница без курсора", () => {
    expect(paginateByOffset([1, 2], 10, 5)).toEqual({ items: [], nextCursor: null, total: 2 });
  });
});
