import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * VK-CLIENT-ID-ALIAS-GATE-MISMATCH — the gate and the runtime resolver must
 * agree about whether VK is configured.
 *
 * The bug: `isVkAuthEnabled` read only the canonical `VK_CLIENT_ID`, while
 * `getVkClientId()` resolved `VK_ID_CLIENT_ID` first. An alias-configured
 * deploy (which is what this repo's own `.env` looks like) therefore rendered
 * no VK button AND got a 503 from `/api/auth/vk/start` — with working
 * credentials present. Both now read one resolved value.
 *
 * This does not turn VK on: `NEXT_PUBLIC_VK_ENABLED` still gates it, and
 * production ships that flag false.
 */

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  AUTH_JWT_SECRET: "x".repeat(64),
  OTP_HMAC_SECRET: "y".repeat(32),
  REDIS_URL: "redis://localhost:6379",
  WORKER_SECRET: "worker-secret",
  MEDIA_DELIVERY_SECRET: "media-secret",
  NEXT_PUBLIC_APP_URL: "https://example.com",
  NODE_ENV: "development",
};

const originalEnv = { ...process.env };

async function loadWithEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, BASE_ENV);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const env = await import("@/lib/env");
  const config = await import("@/lib/vk/config");
  return { isVkAuthEnabled: env.isVkAuthEnabled, getVkClientId: config.getVkClientId };
}

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  vi.resetModules();
});

describe("VK client-id alias — gate and resolver agree", () => {
  it("alias-only creds + flag on → ENABLED (the regression this closes)", async () => {
    const { isVkAuthEnabled, getVkClientId } = await loadWithEnv({
      NEXT_PUBLIC_VK_ENABLED: "true",
      VK_ID_CLIENT_ID: "54447",
      VK_CLIENT_ID: undefined,
    });
    expect(isVkAuthEnabled).toBe(true);
    expect(getVkClientId()).toBe("54447");
  });

  it("canonical-only creds + flag on → ENABLED (unchanged)", async () => {
    const { isVkAuthEnabled, getVkClientId } = await loadWithEnv({
      NEXT_PUBLIC_VK_ENABLED: "true",
      VK_CLIENT_ID: "12345",
      VK_ID_CLIENT_ID: undefined,
    });
    expect(isVkAuthEnabled).toBe(true);
    expect(getVkClientId()).toBe("12345");
  });

  it("alias wins over canonical (precedence preserved)", async () => {
    const { getVkClientId } = await loadWithEnv({
      NEXT_PUBLIC_VK_ENABLED: "true",
      VK_ID_CLIENT_ID: "alias",
      VK_CLIENT_ID: "canonical",
    });
    expect(getVkClientId()).toBe("alias");
  });

  it("flag OFF + creds present → DISABLED (the kill-switch still rules)", async () => {
    const { isVkAuthEnabled } = await loadWithEnv({
      NEXT_PUBLIC_VK_ENABLED: "false",
      VK_ID_CLIENT_ID: "54447",
    });
    expect(isVkAuthEnabled).toBe(false);
  });

  it("no creds under either name → DISABLED even with the flag on", async () => {
    const { isVkAuthEnabled, getVkClientId } = await loadWithEnv({
      NEXT_PUBLIC_VK_ENABLED: "true",
      VK_ID_CLIENT_ID: undefined,
      VK_CLIENT_ID: undefined,
    });
    expect(isVkAuthEnabled).toBe(false);
    expect(getVkClientId()).toBeNull();
  });

  it("blank/whitespace creds do not count as configured", async () => {
    const { isVkAuthEnabled, getVkClientId } = await loadWithEnv({
      NEXT_PUBLIC_VK_ENABLED: "true",
      VK_ID_CLIENT_ID: "   ",
      VK_CLIENT_ID: "",
    });
    expect(isVkAuthEnabled).toBe(false);
    expect(getVkClientId()).toBeNull();
  });
});

describe("VK start route with alias-only creds", () => {
  it("does NOT answer 503 (the flow can actually begin)", async () => {
    vi.resetModules();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, BASE_ENV, {
      NEXT_PUBLIC_VK_ENABLED: "true",
      VK_ID_CLIENT_ID: "54447",
      VK_ID_CLIENT_SECRET: "secret",
      VK_ID_REDIRECT_URI: "https://example.com/api/auth/vk/callback",
    });

    const cookieJar = new Map<string, string>();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
        set: (name: string, value: string) => cookieJar.set(name, value),
      }),
    }));
    vi.doMock("@/lib/auth/session", () => ({ getSessionUser: async () => null }));
    vi.doMock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));

    const { GET } = await import("@/app/api/auth/vk/start/route");
    // Consent params included: RKN-FIX-01 gates the start route on them, and
    // this test is about the credentials gate, not the consent gate.
    const res = await GET(new Request("http://localhost/api/auth/vk/start?terms=1&pd=1&marketing=0"));

    expect(res.status).not.toBe(503);
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("vk.ru");
  });
});
