import test from "node:test";
import assert from "node:assert/strict";
import { filterSlotsByDateKey } from "@/lib/schedule/slots-range";
import { toLocalDateKey } from "@/lib/schedule/timezone";

test("filterSlotsByDateKey excludes slots outside [from,to)", () => {
  const slots = [
    {
      startAtUtc: new Date(Date.UTC(2026, 1, 10, 10, 0)),
      endAtUtc: new Date(Date.UTC(2026, 1, 10, 11, 0)),
      label: "2026-02-10 10:00",
    },
    {
      startAtUtc: new Date(Date.UTC(2026, 1, 11, 10, 0)),
      endAtUtc: new Date(Date.UTC(2026, 1, 11, 11, 0)),
      label: "2026-02-11 10:00",
    },
  ];

  const filtered = filterSlotsByDateKey({
    slots,
    fromKey: "2026-02-10",
    toKey: "2026-02-11",
    timeZone: "UTC",
  });

  assert.equal(filtered.length, 1);
  assert.equal((filtered[0] as { label?: string })?.label, "2026-02-10 10:00");
});

test("filterSlotsByDateKey handles ISO startAtUtc strings", () => {
  const slots = [
    { startAtUtc: "2026-02-10T10:00:00.000Z", label: "2026-02-10 10:00" },
    { startAtUtc: "2026-02-11T10:00:00.000Z", label: "2026-02-11 10:00" },
  ];

  const filtered = filterSlotsByDateKey({
    slots,
    fromKey: "2026-02-10",
    toKey: "2026-02-11",
    timeZone: "UTC",
  });

  assert.equal(filtered.length, 1);
  assert.equal((filtered[0] as { label?: string })?.label, "2026-02-10 10:00");
});

test("toLocalDateKey rejects dateKey strings", () => {
  assert.throws(() => toLocalDateKey("2026-02-06", "UTC"), /Date key string is not allowed/);
});
