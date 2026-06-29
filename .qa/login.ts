// QA harness — reusable phone+OTP login routine.
//
// Deterministic Playwright login: drives the real /login UI (phone -> consent
// -> request OTP -> recover code from DB -> type code -> land). Uses web-first
// locators (getByRole / getByLabel) and auto-waiting assertions only — no
// fixed sleeps. Returns the landed URL plus any console errors / failed
// network requests observed during login + first paint, so the smoke can
// report defects even when login itself "works".

import { expect, type Page } from "@playwright/test";
import { recoverOtp } from "./otp";
import type { Role } from "./roles";

export type ConsoleError = { type: string; text: string };
export type FailedRequest = { method: string; url: string; status: number };

export type LoginResult = {
  landedUrl: string;
  landedPath: string;
  consoleErrors: ConsoleError[];
  failedRequests: FailedRequest[];
};

function attachObservers(page: Page, consoleErrors: ConsoleError[], failedRequests: FailedRequest[]): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ type: "console.error", text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push({ type: "pageerror", text: err.message });
  });
  page.on("response", (resp) => {
    const status = resp.status();
    if (status >= 400) {
      failedRequests.push({ method: resp.request().method(), url: resp.url(), status });
    }
  });
}

export async function loginAs(page: Page, role: Role, baseURL: string): Promise<LoginResult> {
  const consoleErrors: ConsoleError[] = [];
  const failedRequests: FailedRequest[] = [];
  attachObservers(page, consoleErrors, failedRequests);

  // Suppress the two first-visit overlays that otherwise sit over the login
  // form on a fresh context: the city-prompt modal (fixed inset-0 z-50, the
  // real blocker) and the cookie banner. Pre-seeding storage is more
  // deterministic than clicking through them. Keys mirror client-city.ts
  // (mr-city-slug, localStorage-primary + cookie mirror) and
  // cookie-consent.tsx (localStorage "cookie-consent").
  await page.context().addCookies([
    { name: "mr-city-slug", value: "moscow", url: baseURL },
  ]);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("mr-city-slug", "moscow");
      window.localStorage.setItem("cookie-consent", "accepted");
    } catch {
      // localStorage unavailable — cookie still suppresses the city prompt.
    }
  });

  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });

  // Steps 1+2 — phone + consent, retried until the value sticks.
  // Two interacting facts force this shape:
  //   (a) the controlled React <Input> only updates its state from real input
  //       events, so .fill() sets the DOM value without firing onChange and
  //       the consent checkbox never appears — we must TYPE, not fill;
  //   (b) /login has a dev-mode hydration mismatch (server HTML != client,
  //       see QA-003) that regenerates the tree shortly after load and can
  //       wipe input typed too early.
  // Retrying the type until the consent checkbox (which only renders for a
  // valid phone) becomes visible is deterministic against the hydration race.
  const phoneInput = page.getByRole("textbox", { name: /Телефон/ });
  const consent = page.getByRole("checkbox");
  await expect(async () => {
    await phoneInput.click({ clickCount: 3 });
    await phoneInput.pressSequentially(role.phone, { delay: 25 });
    await expect(consent).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await consent.check();

  // Step 3 — request the code.
  await page.getByRole("button", { name: /Отправить код/ }).click();

  // Step 4 — wait for the 6-box OTP step.
  await expect(page.getByLabel("Цифра 1 из 6")).toBeVisible({ timeout: 15_000 });

  // Step 5 — recover the plaintext code from the DB and type it. Typing
  // char-by-char lets the component's focus cascade move between boxes
  // exactly like a real user; the 6th digit auto-submits (onComplete).
  const code = await recoverOtp(role.phone);
  await page.getByLabel("Цифра 1 из 6").click();
  await page.keyboard.type(code, { delay: 80 });

  // Step 6 — land. The auto-submit navigates away from /login; if it did
  // not fire, fall back to clicking the explicit verify button.
  const leftLogin = (url: URL): boolean => !url.pathname.startsWith("/login");
  try {
    await page.waitForURL(leftLogin, { timeout: 15_000 });
  } catch {
    await page.getByRole("button", { name: /Вход/ }).click();
    await page.waitForURL(leftLogin, { timeout: 15_000 });
  }
  await page.waitForLoadState("domcontentloaded");

  const landedUrl = page.url();
  return {
    landedUrl,
    landedPath: new URL(landedUrl).pathname,
    consoleErrors,
    failedRequests,
  };
}
