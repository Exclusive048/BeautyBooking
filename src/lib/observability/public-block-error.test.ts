import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 00-10 — сбой секции публичной страницы виден в логе и в
 * трекере, в том числе в проде (раньше обёртки молчали при `isProduction`).
 *
 * @probe 2026-09-29 — в начало `reportPublicBlockError` вставлен ранний выход
 * по `isProduction` (как было): покраснел «пишет лог и трекер в проде».
 * Возвращено — зелёный.
 */

const logError = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logging/logger", () => ({ logError }));
vi.mock("@/lib/observability/report", () => ({ reportError }));
vi.mock("@/lib/env", () => ({ isProduction: true }));

import { reportPublicBlockError } from "./public-block-error";

beforeEach(() => vi.clearAllMocks());

describe("reportPublicBlockError", () => {
  it("пишет лог и трекер в проде", () => {
    const error = new Error("db down");
    reportPublicBlockError("public-profile", "master-reviews", error, ["getProviderProfile"]);

    expect(logError).toHaveBeenCalledWith("public.block.failed", {
      surface: "public-profile",
      block: "master-reviews",
      sources: ["getProviderProfile"],
      error: "db down",
    });
    expect(reportError).toHaveBeenCalledWith(error, {
      tags: { surface: "public-profile", block: "master-reviews" },
      extra: { sources: ["getProviderProfile"] },
    });
  });
});
