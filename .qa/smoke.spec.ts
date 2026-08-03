// QA harness — login smoke for every role in the registry.
//
// One serial test loops every role so all of them are ALWAYS attempted (a single
// role's failure never skips the rest). Each role gets a fresh 1440x900
// context: log in, assert it lands on its correct surface, screenshot, and on
// success persist storage-state to .qa/auth/<role>.json for reuse by the
// per-role deep-test prompts that follow. Authoritative results are written to
// .qa/smoke-results.json; per-role soft assertions surface failures in the
// Playwright report without aborting the loop.

import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROLES } from "./roles";
import { loginAs, type ConsoleError, type FailedRequest } from "./login";
import { clearOtpRateLimit } from "./otp";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const QA_DIR = path.join(process.cwd(), ".qa");
const AUTH_DIR = path.join(QA_DIR, "auth");
const SHOTS_DIR = path.join(QA_DIR, "screenshots");

type RoleResult = {
  index: number;
  key: string;
  label: string;
  phone: string;
  status: "PASS" | "LANDING_MISMATCH" | "FAIL";
  expectedLanding: string;
  landedPath: string | null;
  consoleErrors: ConsoleError[];
  failedRequests: FailedRequest[];
  screenshot: string;
  error?: string;
};

test("login smoke — all roles", async ({ browser }) => {
  mkdirSync(AUTH_DIR, { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  clearOtpRateLimit(ROLES.map((r) => r.phone));

  const results: RoleResult[] = [];

  for (const role of ROLES) {
    // GATES-FIX-01: сброс окна ПЕРЕД КАЖДОЙ ролью, а не один раз на прогон.
    // OTP_REQUEST_IP_LIMIT = 5/60s, ролей девять — с шестой прогон гарантированно
    // ловил 429 (зафайлено как флейк billing-* ролей). Продуктовый лимит не
    // трогаем: сбрасываем только состояние окна между независимыми логинами.
    clearOtpRateLimit([role.phone]);

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const shotRel = path.join(".qa", "screenshots", `${role.key}.png`);
    const shotAbs = path.join(SHOTS_DIR, `${role.key}.png`);
    try {
      const result = await loginAs(page, role, BASE);
      const matched = result.landedPath === role.expectedLanding;
      await page.screenshot({ path: shotAbs }).catch(() => undefined);
      if (matched) {
        await context.storageState({ path: path.join(AUTH_DIR, `${role.key}.json`) });
      }
      results.push({
        index: role.index,
        key: role.key,
        label: role.label,
        phone: role.phone,
        status: matched ? "PASS" : "LANDING_MISMATCH",
        expectedLanding: role.expectedLanding,
        landedPath: result.landedPath,
        consoleErrors: result.consoleErrors,
        failedRequests: result.failedRequests,
        screenshot: shotRel,
      });
    } catch (err) {
      await page.screenshot({ path: shotAbs }).catch(() => undefined);
      results.push({
        index: role.index,
        key: role.key,
        label: role.label,
        phone: role.phone,
        status: "FAIL",
        expectedLanding: role.expectedLanding,
        landedPath: page.url().includes("/login") ? new URL(page.url()).pathname : null,
        consoleErrors: [],
        failedRequests: [],
        screenshot: shotRel,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await context.close();
    }
  }

  results.sort((a, b) => a.index - b.index);
  writeFileSync(path.join(QA_DIR, "smoke-results.json"), `${JSON.stringify(results, null, 2)}\n`);

  for (const r of results) {
    const detail = r.error ?? `landed ${r.landedPath ?? "—"} (expected ${r.expectedLanding})`;
    expect.soft(r.status, `${r.index}. ${r.label}: ${detail}`).toBe("PASS");
  }
});
