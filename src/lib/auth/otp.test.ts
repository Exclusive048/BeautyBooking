import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
describe("auth/otp", () => {
  const originalSecret = process.env.AUTH_JWT_SECRET;

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = originalSecret;
    }
  });

  it("generates a 6-digit numeric code", () => {
    for (let i = 0; i < 20; i += 1) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("hashes consistently for the same inputs", () => {
    const phone = "+79991234567";
    const code = "123456";
    const hash = hashOtpCode(phone, code);
    expect(hashOtpCode(phone, code)).toBe(hash);
  });

  it("produces different hashes for different inputs", () => {
    const phone = "+79991234567";
    const code = "123456";
    const hash = hashOtpCode(phone, code);
    expect(hashOtpCode(phone, "654321")).not.toBe(hash);
    expect(hashOtpCode("+79991230000", code)).not.toBe(hash);
  });
});
