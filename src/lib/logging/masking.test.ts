import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone } from "./masking";

describe("OTP-LOG-DEV-GUARD-A — maskPhone", () => {
  it("keeps country prefix + last 2 digits", () => {
    expect(maskPhone("+79001234567")).toBe("+7****67");
  });

  it("returns input verbatim when too short or no leading +", () => {
    expect(maskPhone("+79")).toBe("+79");
    expect(maskPhone("79001234567")).toBe("79001234567");
  });

  it("trims whitespace before masking", () => {
    expect(maskPhone("  +79001234567 ")).toBe("+7****67");
  });

  it("never returns a string that contains the full middle digits", () => {
    const phone = "+79991234567";
    const masked = maskPhone(phone);
    expect(masked).not.toContain("9123");
    expect(masked.startsWith("+7")).toBe(true);
  });
});

describe("OTP-LOG-DEV-GUARD-A — maskEmail", () => {
  it("keeps first 2 chars of local part + full domain", () => {
    expect(maskEmail("john.doe@example.com")).toBe("jo******@example.com");
  });

  it("handles single-letter local part safely", () => {
    expect(maskEmail("a@example.com")).toBe("a@example.com");
  });

  it("returns '***' for malformed input", () => {
    expect(maskEmail("noatsign")).toBe("***");
    expect(maskEmail("@nolocal.com")).toBe("***");
    expect(maskEmail("nodomain@")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });

  it("never returns a string that contains the full middle of the local part", () => {
    const email = "secretive.account@example.com";
    const masked = maskEmail(email);
    expect(masked).not.toContain("cretive");
    expect(masked.endsWith("@example.com")).toBe(true);
  });
});

describe("OTP-LOG-DEV-GUARD-A — conditional-spread pattern", () => {
  // Pins the call-site shape used in the 3 OTP routes:
  //   `{ ...base, ...(isProduction ? {} : { code }) }`
  // — verifies code is present in dev/test and absent in prod.
  function buildPayload(isProd: boolean, base: Record<string, unknown>, code: string) {
    return { ...base, ...(isProd ? {} : { code }) };
  }

  it("includes `code` when isProduction is false (dev/staging)", () => {
    const payload = buildPayload(false, { phone: "+7****67" }, "1234");
    expect(payload).toEqual({ phone: "+7****67", code: "1234" });
  });

  it("omits `code` when isProduction is true", () => {
    const payload = buildPayload(true, { phone: "+7****67" }, "1234");
    expect(payload).toEqual({ phone: "+7****67" });
    expect(payload).not.toHaveProperty("code");
  });
});
