import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCurrentWhenLabel } from "./current-when";

/**
 * RESCHEDULE-CURRENT-TIME — «Актуальное время» уведомления о записи.
 *
 * @probe Первая версия правки закрыла только `/notifications`; у мастера
 * своя страница (`features/master/components/notifications`) и своя карточка —
 * живой прогон (`.qa/diagnostics/pwa-ux-batch`) не нашёл строку в кабинете
 * мастера. Проверка полноты ниже краснела на этом состоянии и зеленеет
 * только когда все три карточки зовут общий резолвер.
 */
describe("resolveCurrentWhenLabel", () => {
  const base = {
    startAtUtc: "2026-09-17T07:00:00.000Z",
    currentStartAtUtc: "2026-09-17T07:30:00.000Z",
    providerTimezone: "Asia/Yekaterinburg",
    bookingStatus: "CHANGE_REQUESTED",
  };

  it("показывает живое время в зоне салона с меткой, когда оно разошлось с сохранённым", () => {
    const label = resolveCurrentWhenLabel(base);
    expect(label).not.toBeNull();
    expect(label).toContain("12:30");
    expect(label).toMatch(/GMT\+5/);
  });

  it("молчит, когда время не менялось (в том числе при другом формате ISO)", () => {
    expect(resolveCurrentWhenLabel({ ...base, currentStartAtUtc: base.startAtUtc })).toBeNull();
    expect(resolveCurrentWhenLabel({ ...base, currentStartAtUtc: "2026-09-17T07:00:00Z" })).toBeNull();
  });

  it("молчит без входа: нет сохранённого, живого времени или зоны", () => {
    expect(resolveCurrentWhenLabel(null)).toBeNull();
    expect(resolveCurrentWhenLabel({ ...base, startAtUtc: null })).toBeNull();
    expect(resolveCurrentWhenLabel({ ...base, currentStartAtUtc: undefined })).toBeNull();
    expect(resolveCurrentWhenLabel({ ...base, providerTimezone: "" })).toBeNull();
  });

  it("молчит у отменённой / отклонённой брони и неявки", () => {
    for (const status of ["CANCELLED", "REJECTED", "NO_SHOW", "cancelled"]) {
      expect(resolveCurrentWhenLabel({ ...base, bookingStatus: status })).toBeNull();
    }
  });
});

describe("полнота: все три поверхности уведомлений печатают актуальное время", () => {
  const SURFACES = [
    "src/features/notifications/components/notifications-center-page.tsx",
    "src/features/master/components/notifications/notification-card.tsx",
    "src/features/studio-cabinet/notifications/components/notification-card.tsx",
  ];

  for (const rel of SURFACES) {
    it(rel, () => {
      const source = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(source, "зовёт общий резолвер").toMatch(/resolveCurrentWhenLabel\(/);
      expect(source, "рендерит строку с testid").toContain('data-testid="notification-current-time"');
    });
  }
});
