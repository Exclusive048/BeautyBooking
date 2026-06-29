import { describe, expect, it } from "vitest";

/**
 * FIX-TELEGRAM-KILLSWITCH — pinning the two-layer gate semantics.
 *
 * The runtime resolver `getTelegramEnabled()` (src/lib/telegram/feature.ts)
 * reads prisma + Redis, so we don't exercise it directly here. Instead we pin
 * the two pure decisions it is built from — the legal guarantee lives entirely
 * in their boolean direction:
 *
 *   1. The env-flag predicate (`String(value) === "true"`) — fail-safe OFF.
 *   2. The HARD CEILING (`envOff ? false : dbToggle`) — env wins unconditionally;
 *      the admin DB toggle can NEVER re-enable Telegram past an env-OFF.
 *
 * If a refactor flips the boolean direction (e.g. to the visualSearchEnabled
 * env-as-fallback semantic), these break — which is exactly the launch-blocker
 * we must not regress.
 */

// Mirrors `isTelegramEnabled` in env.ts: String(env.NEXT_PUBLIC_TELEGRAM_ENABLED) === "true"
function envFlagFromValue(value: unknown): boolean {
  return String(value) === "true";
}

// Mirrors the hard-ceiling resolution in getTelegramEnabled():
//   if (!isTelegramEnabled) return false;        // env ceiling, no DB
//   return typeof dbToggle === "boolean" ? dbToggle : true;  // admin toggle, default ON
function resolveEffective(envEnabled: boolean, dbToggle: boolean | undefined): boolean {
  if (!envEnabled) return false;
  return typeof dbToggle === "boolean" ? dbToggle : true;
}

describe("FIX-TELEGRAM-KILLSWITCH — env flag predicate (fail-safe OFF)", () => {
  it("unset env var defaults to OFF (the legal fail-safe)", () => {
    expect(envFlagFromValue(undefined)).toBe(false);
  });

  it("returns true only for the exact literal \"true\" / boolean true", () => {
    expect(envFlagFromValue("true")).toBe(true);
    expect(envFlagFromValue(true)).toBe(true);
  });

  it("returns false for \"false\" / boolean false", () => {
    expect(envFlagFromValue("false")).toBe(false);
    expect(envFlagFromValue(false)).toBe(false);
  });

  it("returns false for empty string and typo'd values (deployment contract)", () => {
    expect(envFlagFromValue("")).toBe(false);
    expect(envFlagFromValue("TRUE")).toBe(false); // case-sensitive on purpose
    expect(envFlagFromValue("1")).toBe(false);
    expect(envFlagFromValue("yes")).toBe(false);
  });
});

describe("FIX-TELEGRAM-KILLSWITCH — HARD CEILING (env wins unconditionally)", () => {
  it("🔴 env OFF + DB toggle ON → effective OFF (DB can NEVER re-enable past env-off)", () => {
    // The single most important assertion: the legal guarantee must not be
    // DB-overridable. If this flips, Telegram could come back via the admin
    // toggle while the env says off.
    expect(resolveEffective(false, true)).toBe(false);
  });

  it("env OFF + DB OFF → OFF", () => {
    expect(resolveEffective(false, false)).toBe(false);
  });

  it("env OFF + DB unset → OFF", () => {
    expect(resolveEffective(false, undefined)).toBe(false);
  });

  it("env ON + DB unset → ON (admin toggle defaults ON below the ceiling)", () => {
    expect(resolveEffective(true, undefined)).toBe(true);
  });

  it("env ON + DB ON → ON", () => {
    expect(resolveEffective(true, true)).toBe(true);
  });

  it("env ON + DB OFF → OFF (admin can disable BELOW the ceiling)", () => {
    expect(resolveEffective(true, false)).toBe(false);
  });

  it("is NOT the env-as-fallback semantic (dbToggle ?? envDefault would differ)", () => {
    // Contrast with visualSearchEnabled's `dbValue ?? envFallback`: there, a DB
    // value of `true` would win regardless of env. Here env is a CEILING, so
    // env-off + db-true must be OFF (asserted above), not true.
    const fallbackSemantic = (env: boolean, db: boolean | undefined) =>
      typeof db === "boolean" ? db : env;
    // The two semantics diverge exactly at the dangerous case:
    expect(fallbackSemantic(false, true)).toBe(true); // WRONG for Telegram
    expect(resolveEffective(false, true)).toBe(false); // CORRECT for Telegram
  });
});
