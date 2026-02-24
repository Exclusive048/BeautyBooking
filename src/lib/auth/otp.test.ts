import test from "node:test";
import assert from "node:assert/strict";
import { generateOtpCode } from "@/lib/auth/otp";

test("generateOtpCode returns a 6-digit numeric code", () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generateOtpCode();
    assert.equal(code.length, 6);
    assert.ok(/^\d{6}$/.test(code));
    const asNumber = Number(code);
    assert.ok(asNumber >= 100000 && asNumber <= 999999);
  }
});
