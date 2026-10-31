import { describe, expect, it } from "vitest";
import { LAUNCH_PROMO_ENDS_AT } from "@/lib/billing/launch-promo";
import { CABINET_ANNOUNCEMENTS_LIMIT, listCabinetAnnouncements } from "./announcements";

/**
 * AI-CABINET-ANALYSIS — «Новое в МастерРядом»: только то, что есть в продукте,
 * со ссылкой в раздел своего кабинета. Акция — первой, пока идёт; о разборе —
 * только когда его карточка есть на главной.
 */

const DURING_PROMO = new Date("2026-11-01T09:00:00.000Z");
const AFTER_PROMO = new Date(LAUNCH_PROMO_ENDS_AT.getTime() + 24 * 3_600_000);
const ALL = 100;

describe("listCabinetAnnouncements", () => {
  it("по умолчанию — первые CABINET_ANNOUNCEMENTS_LIMIT, акция первой", () => {
    const items = listCabinetAnnouncements({ scope: "master", aiAnalysisAvailable: true, now: DURING_PROMO });
    expect(items).toHaveLength(CABINET_ANNOUNCEMENTS_LIMIT);
    expect(items[0]?.id).toBe("betaPromo");
    expect(items[0]?.action?.href).toBe("/cabinet/master/billing");
  });

  it("после конца акции её нет", () => {
    const items = listCabinetAnnouncements({ scope: "studio", aiAnalysisAvailable: true, now: AFTER_PROMO, limit: ALL });
    expect(items.map((item) => item.id)).not.toContain("betaPromo");
  });

  it("остальное — от новых к старым", () => {
    const dates = listCabinetAnnouncements({ scope: "master", aiAnalysisAvailable: true, now: AFTER_PROMO, limit: ALL }).map(
      (item) => item.publishedOn,
    );
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("о разборе — только когда он есть на главной, и ссылка ведёт на его карточку", () => {
    const off = listCabinetAnnouncements({ scope: "master", aiAnalysisAvailable: false, now: AFTER_PROMO, limit: ALL });
    expect(off.map((item) => item.id)).not.toContain("aiAnalysis");
    const on = listCabinetAnnouncements({ scope: "master", aiAnalysisAvailable: true, now: AFTER_PROMO, limit: ALL });
    expect(on.find((item) => item.id === "aiAnalysis")?.action?.href).toBe("#ai-analysis");
  });

  it("переписка студии — только студии", () => {
    const master = listCabinetAnnouncements({ scope: "master", aiAnalysisAvailable: true, now: DURING_PROMO, limit: ALL });
    const studio = listCabinetAnnouncements({ scope: "studio", aiAnalysisAvailable: true, now: DURING_PROMO, limit: ALL });
    expect(master.map((item) => item.id)).not.toContain("studioChat");
    expect(studio.find((item) => item.id === "studioChat")?.action?.href).toBe("/cabinet/studio/messages");
  });

  it("ссылки ведут в разделы своего кабинета", () => {
    for (const scope of ["master", "studio"] as const) {
      const items = listCabinetAnnouncements({ scope, aiAnalysisAvailable: true, now: DURING_PROMO, limit: ALL });
      for (const item of items) {
        const href = item.action?.href;
        if (!href || href.startsWith("#")) continue;
        expect(href.startsWith(`/cabinet/${scope}/`)).toBe(true);
      }
    }
    const breaksMaster = listCabinetAnnouncements({ scope: "master", aiAnalysisAvailable: true, now: DURING_PROMO, limit: ALL });
    const breaksStudio = listCabinetAnnouncements({ scope: "studio", aiAnalysisAvailable: true, now: DURING_PROMO, limit: ALL });
    expect(breaksMaster.find((item) => item.id === "manyBreaks")?.action?.href).toBe("/cabinet/master/schedule/settings");
    expect(breaksStudio.find((item) => item.id === "manyBreaks")?.action?.href).toBe("/cabinet/studio/schedule/team");
  });
});
