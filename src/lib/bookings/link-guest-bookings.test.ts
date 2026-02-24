import test from "node:test";
import assert from "node:assert/strict";
import { buildPhoneVariantsForMatch } from "@/lib/bookings/link-guest-bookings";

test("buildPhoneVariantsForMatch handles russian numbers and variants", () => {
  const result = buildPhoneVariantsForMatch("8 (999) 123-45-67");
  assert.equal(result.normalized, "+89991234567");
  assert.ok(result.variants.includes("+89991234567"));
  assert.ok(result.variants.includes("89991234567"));
  assert.ok(result.variants.includes("+79991234567"));
});

test("buildPhoneVariantsForMatch handles non-russian numbers", () => {
  const result = buildPhoneVariantsForMatch("+12025550123");
  assert.equal(result.normalized, "+12025550123");
  assert.ok(result.variants.includes("+12025550123"));
  assert.ok(result.variants.includes("12025550123"));
});

test("buildPhoneVariantsForMatch ignores empty input", () => {
  const result = buildPhoneVariantsForMatch("  ");
  assert.equal(result.normalized, "");
  assert.equal(result.variants.length, 0);
});
