import test from "node:test";
import assert from "node:assert/strict";
import { canAccessClientCards } from "@/lib/crm/guards";

test("canAccessClientCards allows PRO and PREMIUM", () => {
  assert.equal(canAccessClientCards("PRO"), true);
  assert.equal(canAccessClientCards("PREMIUM"), true);
});

test("canAccessClientCards denies FREE or missing", () => {
  assert.equal(canAccessClientCards("FREE"), false);
  assert.equal(canAccessClientCards(null), false);
  assert.equal(canAccessClientCards(undefined), false);
});
