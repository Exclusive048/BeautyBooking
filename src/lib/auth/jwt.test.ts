import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, verifySessionToken } from "@/lib/auth/jwt";

test("verifySessionToken validates signed tokens", () => {
  const prev = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = "test-secret";

  const token = createSessionToken({ sub: "user-1", roles: ["CLIENT"], phone: null }, 60);
  const payload = verifySessionToken(token);

  assert.ok(payload);
  assert.equal(payload?.sub, "user-1");

  if (prev) {
    process.env.AUTH_JWT_SECRET = prev;
  } else {
    delete process.env.AUTH_JWT_SECRET;
  }
});
