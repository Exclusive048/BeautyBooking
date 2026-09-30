import { describe, expect, it } from "vitest";
import { DEFAULT_DAY_HOURS } from "@/features/master/components/schedule-settings/plan/lib/day-hours";
import { buildTeamRhythmRequests, teamRhythmCoverage } from "./team-rhythm";

const BASE = {
  work: 2,
  off: 2,
  firstDay: "2026-10-05",
  staggered: true,
  hours: DEFAULT_DAY_HOURS,
  endsOn: "2026-12-31",
};

describe("«График по очереди» (SCHEDULE-PATTERNS-01, этап 4)", () => {
  it("два мастера 2 через 2 по очереди — каждый день работает ровно один", () => {
    const input = { ...BASE, masterIds: ["a", "b"] };
    const [first, second] = buildTeamRhythmRequests(input);
    expect(first!.request.pattern.anchorOn).toBe("2026-10-05");
    expect(second!.request.pattern.anchorOn).toBe("2026-10-07");
    // Период у всех начинается в один день — до своей смены мастер в выходных.
    expect(second!.request.pattern.startsOn).toBe("2026-10-05");
    expect(teamRhythmCoverage(input, 12)).toEqual(Array(12).fill(1));
  });

  it("без очереди — все работают в одни дни", () => {
    const input = { ...BASE, masterIds: ["a", "b"], staggered: false };
    expect(teamRhythmCoverage(input, 4)).toEqual([2, 2, 0, 0]);
  });

  it("три мастера 3 через 3 — сдвиг по кругу цикла", () => {
    const input = { ...BASE, work: 3, off: 3, masterIds: ["a", "b", "c"] };
    const anchors = buildTeamRhythmRequests(input).map(({ request }) => request.pattern.anchorOn);
    expect(anchors).toEqual(["2026-10-05", "2026-10-08", "2026-10-05"]);
  });

  it("позиции цикла: рабочие дни — первый рабочий день, дальше выходные", () => {
    const [{ request }] = buildTeamRhythmRequests({ ...BASE, work: 1, off: 2, masterIds: ["a"] });
    expect(request.pattern).toMatchObject({ kind: "CYCLE", cycleDays: 3, days: [0, null, null] });
    expect(request.templates).toHaveLength(1);
  });
});
