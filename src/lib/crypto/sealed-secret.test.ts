import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "a".repeat(64) },
}));

import { openSecret, sealSecret } from "@/lib/crypto/sealed-secret";

describe("sealed-secret — секрет в БД хранится зашифрованным", () => {
  const secret = "vk1.a.community-token-value";

  it("открывается тем же назначением", () => {
    const sealed = sealSecret(secret, "vk-community-token");
    expect(openSecret(sealed, "vk-community-token")).toBe(secret);
  });

  it("в конверте нет открытого текста, и каждый конверт уникален", () => {
    const a = sealSecret(secret, "vk-community-token");
    const b = sealSecret(secret, "vk-community-token");
    expect(a).not.toContain(secret);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
  });

  it("чужое назначение не открывает конверт", () => {
    const sealed = sealSecret(secret, "vk-community-token");
    expect(openSecret(sealed, "other-purpose")).toBeNull();
  });

  it("подделка и мусор дают null, а не исключение", () => {
    const sealed = sealSecret(secret, "vk-community-token");
    const parts = sealed.split(".");
    const ciphertext = Buffer.from(parts[3], "base64url");
    ciphertext[0] ^= 0xff;
    const tampered = [parts[0], parts[1], parts[2], ciphertext.toString("base64url")].join(".");
    expect(openSecret(tampered, "vk-community-token")).toBeNull();
    expect(openSecret("garbage", "vk-community-token")).toBeNull();
    expect(openSecret("v2.a.b.c", "vk-community-token")).toBeNull();
  });
});
