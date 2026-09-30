import { describe, expect, it } from "vitest";
import {
  isStudioSurfaceBooking,
  studioBookingsWhere,
  studioBookingsWhereByProvider,
} from "@/lib/studio/booking-scope";

/**
 * 29.09 доработки · 08 — одно написание скоупа студии.
 *
 * @probe 2026-09-29 — параметр `studioBookingsWhere` сделан `studioId?: string`:
 * `typecheck` упал на «Unused '@ts-expect-error' directive» ниже. Возвращено — зелёный.
 */

describe("studioBookingsWhere", () => {
  it("скоуп — только studioId, без ветки providerId студии", () => {
    expect(studioBookingsWhere("st-1")).toEqual({ studioId: "st-1" });
    expect(studioBookingsWhereByProvider("prov-s")).toEqual({ studio: { providerId: "prov-s" } });
  });

  it("undefined не принимается: `{ studioId: undefined }` — пустое условие Prisma, все записи платформы", () => {
    const missing = undefined as string | undefined;
    // @ts-expect-error — студия обязана быть известна до запроса (класс FIX-7).
    expect(studioBookingsWhere(missing)).toEqual({ studioId: undefined });
  });

  it("в памяти — то же правило: запись поверхности студии по studioId", () => {
    expect(isStudioSurfaceBooking({ studioId: "st-1" }, "st-1")).toBe(true);
    expect(isStudioSurfaceBooking({ studioId: null }, "st-1")).toBe(false);
    expect(isStudioSurfaceBooking({ studioId: "st-2" }, "st-1")).toBe(false);
  });
});
