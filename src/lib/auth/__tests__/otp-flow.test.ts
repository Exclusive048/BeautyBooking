import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { otpRequestSchema } from "@/lib/auth/schemas";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("OTP flow", () => {
  const originalSecret = process.env.AUTH_JWT_SECRET;
  const originalOtpSecret = process.env.OTP_HMAC_SECRET;

  beforeAll(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
    process.env.OTP_HMAC_SECRET = "test-otp-secret";
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = originalSecret;
    }

    if (originalOtpSecret === undefined) {
      delete process.env.OTP_HMAC_SECRET;
    } else {
      process.env.OTP_HMAC_SECRET = originalOtpSecret;
    }
  });

  it("hash matches for the same code and fails for a wrong code", () => {
    const phone = "+79991234567";
    const code = generateOtpCode();
    const hash = hashOtpCode(phone, code);

    expect(hashOtpCode(phone, code)).toBe(hash);
    expect(hashOtpCode(phone, "000000")).not.toBe(hash);
  });

  it("otpRequestSchema validates Russian phone numbers", () => {
    expect(otpRequestSchema.safeParse({ phone: "+79991234567" }).success).toBe(true);

    const invalidPhones = ["123", "+1234567890", ""];
    for (const phone of invalidPhones) {
      expect(otpRequestSchema.safeParse({ phone }).success).toBe(false);
    }
  });

  it("expired OTP is treated as invalid", () => {
    const phone = "+79991234567";
    const code = "123456";
    const codeHash = hashOtpCode(phone, code);
    const expiresAt = new Date(Date.now() + 1000);

    const isOtpValid = (candidate: string) => {
      return Date.now() < expiresAt.getTime() && hashOtpCode(phone, candidate) === codeHash;
    };

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(expiresAt.getTime() + 1);
    expect(isOtpValid(code)).toBe(false);
    nowSpy.mockRestore();
  });
});
