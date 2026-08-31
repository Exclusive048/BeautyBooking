import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { BROWSER_DENY_URLS, BROWSER_IGNORE_ERRORS, shouldDropError, shouldReportFailure } from "./noise";

/**
 * OBSERVABILITY-GLITCHTIP-01 — the filters exist so the channel stays worth
 * reading. These tests pin both directions: the noise really is dropped, and
 * genuine failures really do get through.
 */

describe("shouldDropError", () => {
  it("drops expected business outcomes modelled as 4xx AppErrors", () => {
    expect(shouldDropError(new AppError("Слот занят", 409, "BOOKING_CONFLICT"))).toBe(true);
    expect(shouldDropError(new AppError("Нет доступа", 403, "FORBIDDEN"))).toBe(true);
    expect(shouldDropError(new AppError("Некорректные данные", 400, "INVALID_BODY"))).toBe(true);
    expect(shouldDropError(new AppError("Повтор запроса", 409, "DUPLICATE_REQUEST"))).toBe(true);
    expect(shouldDropError(new AppError("Отменить можно только пакет", 409, "PACKAGE_CANCEL_WHOLE"))).toBe(true);
  });

  it("drops the deliberate 503 from a disabled auth provider (FZ-199 kill-switch)", () => {
    expect(shouldDropError(new AppError("Auth method not configured", 503, "SERVICE_UNAVAILABLE"))).toBe(true);
  });

  it("keeps real server faults", () => {
    expect(shouldDropError(new AppError("Internal error", 500, "INTERNAL_ERROR"))).toBe(false);
    expect(shouldDropError(new Error("Cannot read properties of null (reading 'ownerUserId')"))).toBe(false);
    expect(shouldDropError(new TypeError("prisma.booking.findMany is not a function"))).toBe(false);
  });

  it("drops Next.js control flow — redirect() and notFound() throw by design", () => {
    expect(shouldDropError(new Error("NEXT_REDIRECT;replace;/login;307"))).toBe(true);
    expect(shouldDropError(Object.assign(new Error("x"), { digest: "NEXT_NOT_FOUND" }))).toBe(true);
    expect(shouldDropError(new Error("DYNAMIC_SERVER_USAGE: cookies()"))).toBe(true);
  });

  it("drops client disconnects", () => {
    expect(shouldDropError(Object.assign(new Error("aborted"), { code: "ECONNRESET" }))).toBe(true);
  });

  it("survives non-Error input without throwing", () => {
    expect(shouldDropError(undefined)).toBe(false);
    expect(shouldDropError(null)).toBe(false);
    expect(shouldDropError("boom")).toBe(false);
    expect(shouldDropError({ nested: { deep: true } })).toBe(false);
  });
});

describe("shouldReportFailure", () => {
  it("never reports 4xx — that is the client's problem by definition", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldReportFailure(status), String(status)).toBe(false);
    }
  });

  it("reports genuine server faults", () => {
    expect(shouldReportFailure(500, "INTERNAL_ERROR")).toBe(true);
    expect(shouldReportFailure(502)).toBe(true);
  });

  it("does not report deliberate unavailability", () => {
    expect(shouldReportFailure(503, "SERVICE_UNAVAILABLE")).toBe(false);
    expect(shouldReportFailure(500, "SERVICE_UNAVAILABLE")).toBe(false);
  });
});

describe("browser filters", () => {
  const matches = (patterns: (string | RegExp)[], value: string) =>
    patterns.some((pattern) => (typeof pattern === "string" ? value.includes(pattern) : pattern.test(value)));

  it("ignores the known unactionable browser noise", () => {
    for (const message of [
      "ResizeObserver loop completed with undelivered notifications.",
      "TypeError: Failed to fetch",
      "ChunkLoadError: Loading chunk 4821 failed.",
      "TypeError: Cannot read properties of undefined (reading 'call')",
      "Script error.",
      "AbortError: The user aborted a request.",
    ]) {
      expect(matches(BROWSER_IGNORE_ERRORS, message), message).toBe(true);
    }
  });

  it("does not ignore a real application error", () => {
    expect(matches(BROWSER_IGNORE_ERRORS, "TypeError: booking.startAtUtc is undefined")).toBe(false);
  });

  it("denies stack frames originating in browser extensions", () => {
    expect(matches(BROWSER_DENY_URLS, "chrome-extension://abcdef/content.js")).toBe(true);
    expect(matches(BROWSER_DENY_URLS, "moz-extension://abcdef/inject.js")).toBe(true);
    expect(matches(BROWSER_DENY_URLS, "https://masterryadom.ru/_next/static/chunks/main.js")).toBe(false);
  });
});
