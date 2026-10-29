import { describe, expect, it } from "vitest";
import { resolveFlushAfterParam } from "@/lib/schedule/flush-after";

// SLOTS-FLUSH-STARTS: `?after=` у выдачи окошек учитывается только для запроса
// одного дня, на который момент приходится в поясе салона.
describe("resolveFlushAfterParam", () => {
  const request = { fromKey: "2026-03-03", toKey: "2026-03-03", limit: undefined, timeZone: "UTC" };

  it("берёт момент для запроса одного дня", () => {
    expect(resolveFlushAfterParam("2026-03-03T10:20:00.000Z", request)?.toISOString()).toBe(
      "2026-03-03T10:20:00.000Z",
    );
    // `/availability` студии просит один день через `limit=1`.
    expect(
      resolveFlushAfterParam("2026-03-03T10:20:00.000Z", { ...request, toKey: "", limit: 1 }),
    ).not.toBeNull();
  });

  it("не учитывает момент для диапазона дней", () => {
    expect(resolveFlushAfterParam("2026-03-03T10:20:00.000Z", { ...request, toKey: "2026-03-10" })).toBeNull();
    expect(resolveFlushAfterParam("2026-03-03T10:20:00.000Z", { ...request, toKey: "", limit: 14 })).toBeNull();
    expect(resolveFlushAfterParam("2026-03-03T10:20:00.000Z", { ...request, toKey: "" })).toBeNull();
  });

  it("не учитывает момент другого дня и мусор", () => {
    expect(resolveFlushAfterParam("2026-03-04T10:20:00.000Z", request)).toBeNull();
    expect(resolveFlushAfterParam("не дата", request)).toBeNull();
    expect(resolveFlushAfterParam(null, request)).toBeNull();
  });

  // Тестовый якорь пояса: 20:30Z 3 марта — уже 4 марта в Екатеринбурге (GMT+5).
  it("сверяет день в поясе салона", () => {
    const yekaterinburg = { ...request, timeZone: "Asia/Yekaterinburg" };
    expect(resolveFlushAfterParam("2026-03-03T20:30:00.000Z", yekaterinburg)).toBeNull();
    expect(
      resolveFlushAfterParam("2026-03-03T20:30:00.000Z", {
        ...yekaterinburg,
        fromKey: "2026-03-04",
        toKey: "2026-03-04",
      }),
    ).not.toBeNull();
  });
});
