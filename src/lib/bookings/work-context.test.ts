import { describe, expect, it } from "vitest";

import {
  BOOKING_WORK_CONTEXT_SELECT,
  resolveBookingWorkContext,
  shouldShowWorkContext,
  splitRevenueByWorkContext,
} from "@/lib/bookings/work-context";

/**
 * STUDIO-MASTER-PROFILES (этап 3, решение владельца 2026-09-27): у записи в
 * кабинете мастера видно, личная она или студии. Правило выводится из ТОГО,
 * ГДЕ записали (поверхность, инв. #45), — не из членства мастера в студии:
 * личная запись мастера студии остаётся личной.
 *
 * @probe 2026-09-27 — в `resolveBookingWorkContext` проверка поверхности
 * (`provider.type === "STUDIO"`) заменена проверкой одной колонки
 * (`row.studioId`) — правдоподобная «упрощающая» правка: краснеет «поверхность —
 * студия, но колонка пуста (легаси до FIX-C1)» (`expected { kind: 'PERSONAL' }
 * to deeply equal { kind, studioName }`). Такие строки в dev-данных есть
 * (разбор B3), и без этого кейса они молча стали бы «личными». Возвращено —
 * зелёный.
 */

describe("resolveBookingWorkContext", () => {
  it("поверхность — студия: запись студии с её названием", () => {
    expect(
      resolveBookingWorkContext({ studioId: "s1", provider: { type: "STUDIO", name: "Vision Beauty Studio" } }),
    ).toEqual({ kind: "STUDIO", studioName: "Vision Beauty Studio" });
  });

  it("поверхность — студия, но колонка пуста (легаси до FIX-C1) — всё равно студия", () => {
    expect(
      resolveBookingWorkContext({ studioId: null, provider: { type: "STUDIO", name: "Vision" } }),
    ).toEqual({ kind: "STUDIO", studioName: "Vision" });
  });

  it("поверхность — профиль мастера: личная запись", () => {
    expect(
      resolveBookingWorkContext({ studioId: null, provider: { type: "MASTER", name: "Марина" } }),
    ).toEqual({ kind: "PERSONAL" });
  });

  it("выборка для правила — ровно то, что оно читает", () => {
    expect(BOOKING_WORK_CONTEXT_SELECT).toEqual({
      studioId: true,
      provider: { select: { type: true, name: true } },
    });
  });
});

describe("shouldShowWorkContext", () => {
  it("соло-мастер без студийных записей — пометки нет (шум, а не информация)", () => {
    expect(shouldShowWorkContext({ masterInStudio: false, contexts: [{ kind: "PERSONAL" }] })).toBe(false);
  });

  it("мастер в студии — пометка есть, даже если на экране одни личные", () => {
    expect(shouldShowWorkContext({ masterInStudio: true, contexts: [{ kind: "PERSONAL" }] })).toBe(true);
  });

  it("есть студийная запись — пометка есть (мастер уже ушёл из студии, история осталась)", () => {
    expect(
      shouldShowWorkContext({
        masterInStudio: false,
        contexts: [{ kind: "PERSONAL" }, { kind: "STUDIO", studioName: "Vision" }],
      }),
    ).toBe(true);
  });
});

describe("splitRevenueByWorkContext", () => {
  it("личное и студийное — раздельно, сумма сохраняется", () => {
    const split = splitRevenueByWorkContext([
      { context: { kind: "PERSONAL" }, amount: 150_000 },
      { context: { kind: "STUDIO", studioName: "Vision" }, amount: 220_000 },
      { context: { kind: "STUDIO", studioName: "Vision" }, amount: 30_000 },
    ]);
    expect(split).toEqual({ personal: 150_000, studio: 250_000 });
  });

  it("пусто — нули", () => {
    expect(splitRevenueByWorkContext([])).toEqual({ personal: 0, studio: 0 });
  });
});
