import { describe, expect, it } from "vitest";
import { isVapidConfigured } from "./vapid-config";

describe("isVapidConfigured (VAPID-NON-NULL-FIX BUCKET-A)", () => {
  it("returns true when all three trimmed values are non-empty", () => {
    expect(isVapidConfigured("public-key", "private-key", "ops@example.com")).toBe(true);
  });

  it("returns false when public key is missing", () => {
    expect(isVapidConfigured(undefined, "private-key", "ops@example.com")).toBe(false);
  });

  it("returns false when private key is missing", () => {
    expect(isVapidConfigured("public-key", undefined, "ops@example.com")).toBe(false);
  });

  it("returns false when email is missing", () => {
    expect(isVapidConfigured("public-key", "private-key", undefined)).toBe(false);
  });

  it("returns false when public key is empty string (post-trim hazard)", () => {
    // Whitespace-only env value passes the env.ts truthiness check but `.trim()`
    // yields "". Pre-fix this crashed webpush.setVapidDetails with cryptic error.
    expect(isVapidConfigured("", "private-key", "ops@example.com")).toBe(false);
  });

  it("returns false when private key is empty string", () => {
    expect(isVapidConfigured("public-key", "", "ops@example.com")).toBe(false);
  });

  it("returns false when email is empty string", () => {
    expect(isVapidConfigured("public-key", "private-key", "")).toBe(false);
  });

  it("returns false when all values are undefined (push disabled)", () => {
    expect(isVapidConfigured(undefined, undefined, undefined)).toBe(false);
  });

  it("returns false when all values are empty strings", () => {
    expect(isVapidConfigured("", "", "")).toBe(false);
  });
});
