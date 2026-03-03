import { buildSlotsForDay } from "@/lib/schedule/slots";

describe("schedule/slots", () => {
  const basePlan = {
    isWorking: true,
    workingIntervals: [{ start: "10:00", end: "12:00" }],
    breaks: [],
    meta: { source: "weekly-template" as const },
  };

  it("generates slots within working interval", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    expect(slots[0]?.label).toBe("2026-03-03 10:00");
    expect(slots[slots.length - 1]?.label).toBe("2026-03-03 11:30");
    expect(slots).toHaveLength(19);
  });

  it("skips slots overlapping breaks", () => {
    const slots = buildSlotsForDay({
      dayPlan: {
        ...basePlan,
        breaks: [{ start: "10:30", end: "10:45" }],
      },
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    const labels = slots.map((slot) => slot.label);
    expect(labels).not.toContain("2026-03-03 10:30");
  });

  it("skips slots conflicting with bookings", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [
        {
          startAtUtc: new Date("2026-03-03T10:00:00Z"),
          endAtUtc: new Date("2026-03-03T11:00:00Z"),
        },
      ],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    expect(slots[0]?.label).toBe("2026-03-03 11:00");
  });

  it("returns no slots for past dateKey", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      now: new Date("2026-03-03T13:00:00Z"),
    });

    expect(slots).toEqual([]);
  });
});
