import test from "node:test";
import assert from "node:assert/strict";
import { listDateKeysExclusive } from "@/lib/schedule/dateKey";

test("listDateKeysExclusive excludes toKeyExclusive", () => {
  const keys = listDateKeysExclusive("2026-02-10", "2026-02-12");
  assert.deepEqual(keys, ["2026-02-10", "2026-02-11"]);
});
