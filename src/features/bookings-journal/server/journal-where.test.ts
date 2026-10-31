import { describe, expect, it } from "vitest";
import { buildMasterJournalWhere } from "@/lib/master/bookings-journal.service";
import { journalSearchWhere, journalWindowWhere } from "./journal-where";

/**
 * BOOKINGS-JOURNAL — условия журнала: границы суток — полночь САЛОНА
 * (salon-tz), поиск — каждое слово хотя бы в одном поле, у мастера — без
 * имени мастера.
 */

describe("journalWindowWhere", () => {
  it("день екатеринбургской студии начинается в 19:00 UTC накануне", () => {
    expect(journalWindowWhere({ fromKey: "2026-10-31", toKeyExclusive: "2026-11-01" }, "Asia/Yekaterinburg")).toEqual({
      startAtUtc: { gte: new Date("2026-10-30T19:00:00.000Z"), lt: new Date("2026-10-31T19:00:00.000Z") },
    });
  });

  it("у «предстоящих» конца нет", () => {
    expect(journalWindowWhere({ fromKey: "2026-10-31", toKeyExclusive: null }, "Europe/Moscow")).toEqual({
      startAtUtc: { gte: new Date("2026-10-30T21:00:00.000Z") },
    });
  });
});

describe("journalSearchWhere", () => {
  it("пустой поиск — без условия", () => {
    expect(journalSearchWhere("  ", { includeMaster: true })).toBeNull();
  });

  it("каждое слово — своё условие; имя мастера ищется только у студии", () => {
    const studio = journalSearchWhere("Анна Марина", { includeMaster: true });
    expect(studio?.AND).toHaveLength(2);
    expect(JSON.stringify(studio)).toContain("masterProvider");
    expect(JSON.stringify(journalSearchWhere("Анна", { includeMaster: false }))).not.toContain("masterProvider");
  });

  it("номер ищется в записи и в аккаунте клиента", () => {
    const where = JSON.stringify(journalSearchWhere("+7 999 123", { includeMaster: false }));
    expect(where).toContain("clientPhone");
    expect(where).toContain("clientPhoneSnapshot");
    expect(where).toContain("clientUser");
  });
});

describe("buildMasterJournalWhere", () => {
  const base = {
    workProfileIds: ["p1", "p2"],
    timeZone: "Europe/Moscow",
    window: { fromKey: "2026-10-31", toKeyExclusive: "2026-11-01" },
    search: "",
    status: "all" as const,
    limit: 50,
    order: "asc" as const,
  };

  it("скоуп — все рабочие профили мастера, окно — сутки салона", () => {
    const where = buildMasterJournalWhere(base);
    const text = JSON.stringify(where);
    expect(text).toContain("p1");
    expect(text).toContain("p2");
    expect(text).toContain("2026-10-30T21:00:00.000Z");
  });

  it("история клиента без окна; состояние сужает статусы", () => {
    const where = buildMasterJournalWhere({ ...base, window: null, status: "awaiting" });
    const text = JSON.stringify(where);
    expect(text).not.toContain("2026-10-30T21:00:00.000Z");
    expect(text).toContain("CHANGE_REQUESTED");
  });
});
