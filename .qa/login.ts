// QA harness — reusable phone+OTP login routine.
//
// Deterministic Playwright login: drives the real /login UI (phone -> consent
// -> request OTP -> recover code from DB -> type code -> land). Uses web-first
// locators (getByRole / getByLabel) and auto-waiting assertions only — no
// fixed sleeps. Returns the landed URL plus any console errors / failed
// network requests observed during login + first paint, so the smoke can
// report defects even when login itself "works".

import { expect, type Page, type Browser } from "@playwright/test";
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
  // RKN-FIX-01: consent is no longer ONE checkbox. The form now carries three
  // independent purposes — offer, PD processing (both required) and marketing
  // (optional) — so `getByRole("checkbox")` is a strict-mode violation. The
  // harness ticks exactly the two required ones and deliberately leaves
  // marketing alone: that is the shape a real registration takes, and it keeps
  // the seed accounts free of a marketing consent nothing asked for.
  const consentGroup = page.getByRole("group", { name: "Согласия" });
  const requiredConsents = consentGroup.getByRole("checkbox").nth(0);
  const requiredConsentsPd = consentGroup.getByRole("checkbox").nth(1);
  // Fold type -> consent-appears -> check -> assert-checked into ONE retry unit
  // (40 s for cold compiles). The QA-003 hydration race can wipe the tree
  // between "consent visible" and a separate `.check()`, which failed ~20% of
  // logins in the PASS-02 stability run; retrying the whole unit absorbs it.
  await expect(async () => {
    await phoneInput.click({ clickCount: 3 });
    await phoneInput.pressSequentially(role.phone, { delay: 25 });
    await expect(requiredConsents).toBeVisible({ timeout: 2000 });
    for (const box of [requiredConsents, requiredConsentsPd]) {
      if (!(await box.isChecked().catch(() => false))) {
        await box.check({ timeout: 2000 });
      }
    }
    await expect(requiredConsents).toBeChecked({ timeout: 1000 });
    await expect(requiredConsentsPd).toBeChecked({ timeout: 1000 });
  }).toPass({ timeout: 40_000 });

  // Step 3 — request the code.
  await page.getByRole("button", { name: /Отправить код/ }).click();

  // Step 4 — wait for the 6-box OTP step (30 s: the request round-trips and a
  // cold dev compile of the verify step can be slow).
  await expect(page.getByLabel("Цифра 1 из 6")).toBeVisible({ timeout: 30_000 });

  // Step 5 — recover the plaintext code from the DB and type it. Typing
  // char-by-char lets the component's focus cascade move between boxes
  // exactly like a real user; the 6th digit auto-submits (onComplete).
  const code = await recoverOtp(role.phone);
  await page.getByLabel("Цифра 1 из 6").click();
  await page.keyboard.type(code, { delay: 80 });

  // Step 6 — land. The 6th OTP digit auto-submits and navigates away from
  // /login. Under a slow dev compile that navigation can exceed the first
  // wait; when it does, login has usually ALREADY succeeded, so the old
  // fallback clicked a «Вход» button that no longer exists → a 20 s timeout
  // and a false failure (the PASS-01 papercut). Fix: only fall back if we are
  // genuinely still on /login, and only click the button if it is actually
  // present. Waits are 30 s to tolerate cold on-demand compiles.
  const leftLogin = (url: URL): boolean => !url.pathname.startsWith("/login");
  const alreadyLeft = (): boolean => leftLogin(new URL(page.url()));
  try {
    await page.waitForURL(leftLogin, { timeout: 30_000 });
  } catch {
    if (!alreadyLeft()) {
      const verify = page.getByRole("button", { name: /Вход/ });
      if (await verify.isVisible().catch(() => false)) {
        await verify.click().catch(() => {});
      }
      // Still on /login and no button fired — give the auto-submit more room.
      await page.waitForURL(leftLogin, { timeout: 30_000 });
    }
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

/**
 * Resilient login for flow-driving. `/login` has a known dev-mode hydration
 * mismatch (QA-003) that intermittently (~20% single-attempt) wipes the
 * phone/consent tree mid-entry → a `toBeVisible` timeout. That is a dev
 * artifact of the page, not a product auth defect, and it is *recoverable*:
 * loginAs either lands cleanly or throws — it never falsely reports success.
 * So retry the whole login on a fresh context (3 attempts → ~99% success),
 * which is what lets Phase-B flow specs drive reliably. Returns the logged-in
 * page (caller closes `page.context()` when done).
 */
export async function loginResilient(
  browser: Browser,
  role: Role,
  baseURL: string,
  attempts = 3,
): Promise<{ page: Page; result: LoginResult; attempt: number }> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      const result = await loginAs(page, role, baseURL);
      return { page, result, attempt: i };
    } catch (e) {
      lastErr = e;
      await ctx.close().catch(() => {});
    }
  }
  throw new Error(
    `loginResilient(${role.key}) failed after ${attempts} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}
