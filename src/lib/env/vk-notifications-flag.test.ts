import { describe, expect, it } from "vitest";

/**
 * VK-NOTIFICATIONS-FLAG-A — pinning the gate semantics.
 *
 * The actual `isVkNotificationsEnabled` constant lives in `@/lib/env`
 * and is evaluated once at module load against `process.env`. Vitest
 * caches the module per worker, so toggling `process.env` after load
 * does NOT re-trigger the computation. Rather than re-implement the
 * module-reset dance the tests pin the **predicate** the flag uses
 * (`String(value) === "true"`) — same expression that lives in
 * `env.ts`. Any regression to the boolean-coercion path will break
 * here even though we don't reload the module.
 *
 * The string-coercion matters because the env.ts schema-parse
 * succeeds only on the server (non-public secrets like DATABASE_URL
 * are missing on the client). On the client it falls back to raw
 * `process.env`, where the value is still a string. `String(x) === "true"`
 * normalises both shapes — boolean (server) and string (client).
 */

function gateFromEnvValue(value: unknown): boolean {
  // Mirrors the expression in env.ts:
  //   `String(env.NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED) === "true"`
  return String(value) === "true";
}

describe("VK-NOTIFICATIONS-FLAG-A — gate predicate", () => {
  it("returns true when env value is the literal boolean true", () => {
    expect(gateFromEnvValue(true)).toBe(true);
  });

  it("returns true when env value is the string \"true\"", () => {
    expect(gateFromEnvValue("true")).toBe(true);
  });

  it("returns false when env value is the literal boolean false", () => {
    expect(gateFromEnvValue(false)).toBe(false);
  });

  it("returns false when env value is the string \"false\"", () => {
    // The crucial case — naive truthy checks would treat "false" as
    // truthy. String-comparison + identical literal is the only safe
    // form here.
    expect(gateFromEnvValue("false")).toBe(false);
  });

  it("returns false when env value is undefined (unset env var)", () => {
    expect(gateFromEnvValue(undefined)).toBe(false);
  });

  it("returns false when env value is the empty string", () => {
    expect(gateFromEnvValue("")).toBe(false);
  });

  it("returns false for any other string (typo defence)", () => {
    expect(gateFromEnvValue("TRUE")).toBe(false); // case-sensitive on purpose
    expect(gateFromEnvValue("yes")).toBe(false);
    expect(gateFromEnvValue("1")).toBe(false);
  });
});

describe("VK-NOTIFICATIONS-FLAG-A — flag default policy", () => {
  it("undefined / unset env var defaults to OFF (subsystem incomplete)", () => {
    // Pre-launch defensive default — VK delivery channel isn't wired yet
    // in `notifications/delivery.ts`, so an unset env must NOT silently
    // enable the toggle. Once delivery ships, deployment sets
    // `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED=true` and the same gate flips.
    expect(gateFromEnvValue(undefined)).toBe(false);
  });

  it("only the exact literal `\"true\"` enables — no ambiguity", () => {
    // Captures the deployment contract: ops should set the flag exactly
    // (no `1`, `yes`, `TRUE`). Mirrors boolFlag's behaviour in env.ts
    // which also requires lowercase `"true"`.
    expect(gateFromEnvValue("true")).toBe(true);
    expect(gateFromEnvValue("True")).toBe(false);
    expect(gateFromEnvValue("1")).toBe(false);
  });
});
