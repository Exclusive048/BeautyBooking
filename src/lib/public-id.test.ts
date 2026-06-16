import { describe, it, expect } from "vitest";
import { encodePublicId, decodePublicId } from "@/lib/public-id";

describe("public-id (RULE-12-REMAINDER opaque id)", () => {
  it("round-trips encode → decode", () => {
    const id = "cmprgov5t014nvlakz0n9vn00";
    expect(decodePublicId(encodePublicId(id))).toBe(id);
  });

  it("encoded token does not contain the raw id", () => {
    const id = "cmprgov5t014nvlakz0n9vn00";
    const token = encodePublicId(id);
    expect(token).not.toContain(id);
    expect(token.startsWith("e_")).toBe(true);
  });

  it("token is URL-safe (base64url alphabet + prefix only)", () => {
    const token = encodePublicId("cmprgov5t014nvlakz0n9vn00");
    expect(token).toMatch(/^e_[A-Za-z0-9_-]+$/);
  });

  it("decode is backward-compatible: a raw id (no prefix) passes through unchanged", () => {
    const raw = "cmprgov5t014nvlakz0n9vn00";
    expect(decodePublicId(raw)).toBe(raw);
  });

  it("distinct ids produce distinct tokens", () => {
    expect(encodePublicId("a-1")).not.toBe(encodePublicId("a-2"));
  });
});
