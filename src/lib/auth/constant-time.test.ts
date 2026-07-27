import { describe, it, expect } from "vitest";
import { timingSafeStringEqual } from "@/lib/auth/constant-time";

describe("timingSafeStringEqual (SECURITY-EXPOSURE-AUDIT-01 B1)", () => {
  it("returns true for identical secrets", () => {
    expect(timingSafeStringEqual("s3cret-token-value", "s3cret-token-value")).toBe(true);
  });

  it("returns false for a mismatch", () => {
    expect(timingSafeStringEqual("s3cret-token-value", "s3cret-token-valuX")).toBe(false);
  });

  it("returns false for different lengths without throwing (hash-then-compare)", () => {
    expect(timingSafeStringEqual("short", "a-much-longer-secret-token")).toBe(false);
    expect(timingSafeStringEqual("", "x")).toBe(false);
  });

  it("returns true for two empty strings (both hash to the same digest)", () => {
    expect(timingSafeStringEqual("", "")).toBe(true);
  });

  it("is case- and unicode-exact", () => {
    expect(timingSafeStringEqual("Токен", "Токен")).toBe(true);
    expect(timingSafeStringEqual("Token", "token")).toBe(false);
  });
});
