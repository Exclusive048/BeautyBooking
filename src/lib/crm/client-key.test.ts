import test from "node:test";
import assert from "node:assert/strict";
import { buildClientKey, parseClientKey } from "@/lib/crm/client-key";

test("buildClientKey prefers user id", () => {
  const result = buildClientKey({ clientUserId: "u1", clientPhone: "+79991234567" });
  assert.equal(result.key, "user:u1");
  assert.equal(result.type, "user");
});

test("buildClientKey normalizes phone", () => {
  const result = buildClientKey({ clientPhone: "8 (999) 123-45-67" });
  assert.equal(result.key, "phone:+79991234567");
});

test("parseClientKey returns null for invalid input", () => {
  assert.equal(parseClientKey("invalid"), null);
});

test("parseClientKey normalizes phone input", () => {
  const result = parseClientKey("phone:8 (999) 123-45-67");
  assert.equal(result?.key, "phone:+79991234567");
});
