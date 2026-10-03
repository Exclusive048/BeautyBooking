// QA harness — reusable OTP login routine (phone AND email).
//
// Deterministic Playwright login: drives the real /login UI (identity ->
// consent -> request OTP -> recover code from DB -> type code -> land). Uses
// web-first locators (getByRole / getByLabel) and auto-waiting assertions only
// — no fixed sleeps. Returns the landed URL plus any console errors / failed
// network requests observed during login + first paint, so the smoke can
// report defects even when login itself "works".
//
// QA-HARNESS-EMAIL-01 — the channel is taken FROM THE PAGE, not hardcoded.
// QA-003 §9 ratified this: dev and prod expose different channels (dev opens on
// phone, prod on email, because `PHONE_AUTH_ENABLED` is a server-only tri-state
// that is OFF in production), so a spec that hardcodes a channel passes in one
// environment and fails in the other for reasons that have nothing to do with
// what it was testing. `channel: "auto"` (the default) uses whatever the page
// opened on; asking for a specific channel clicks its tab and fails loudly if
// that channel is not live — which is the honest outcome, not a silent skip.

import { expect, type Page, type Browser } from "@playwright/test";
import { recoverOtp } from "./otp";
import type { Role } from "./roles";

/** Which OTP channel to drive. `auto` = whatever /login opened on. */
export type LoginChannel = "auto" | "phone" | "email";

export type LoginOptions = { channel?: LoginChannel };

export type ConsoleError = { type: string; text: string };
export type FailedRequest = { method: string; url: string; status: number };

export type LoginResult = {
  landedUrl: string;
  landedPath: string;
  consoleErrors: ConsoleError[];
  failedRequests: FailedRequest[];
  /** Which channel actually drove this login — useful when `auto` chose it. */
  channel: "phone" | "email";
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

/**
 * Resolve which channel to drive, on the page as it actually rendered.
 *
 * LOGIN-TILES-01: the code field lives in a panel that the «Почта» / «Телефон»
 * tile opens (`login-client.tsx`). The panel starts open only when a single
 * OTP channel is the whole choice, so a visible input means "that is the
 * channel"; otherwise the tile for the wanted channel is pressed. Switching
 * channels clears the identifier field (`switchMode` resets phone/email/code),
 * so this must run BEFORE anything is typed.
 */
async function resolveChannel(page: Page, want: LoginChannel): Promise<"phone" | "email"> {
  const emailTile = page.getByTestId("login-tab-email");
  const phoneTile = page.getByTestId("login-tab-phone");
  const emailInput = page.locator("#email-input");
  const phoneInput = page.locator("#phone-input");

  // Wait for the form to exist at all before deciding anything.
  await expect(
    emailInput.or(phoneInput).or(emailTile).or(phoneTile).first(),
  ).toBeVisible({ timeout: 30_000 });

  if (want === "auto") {
    if (await emailInput.isVisible().catch(() => false)) return "email";
    if (await phoneInput.isVisible().catch(() => false)) return "phone";
    // Email first, as on the page itself: it works in prod without SMS creds.
    want = (await emailTile.isVisible().catch(() => false)) ? "email" : "phone";
  }

  const target = want === "email" ? emailInput : phoneInput;
  if (await target.isVisible().catch(() => false)) return want;

  const tile = want === "email" ? emailTile : phoneTile;
  if (!(await tile.isVisible().catch(() => false))) {
    // No tile and no input for the requested channel ⇒ it is gated off server-side.
    // Fail with the reason rather than quietly logging in through the other one.
    throw new Error(
      `loginAs: channel "${want}" is not available on /login (no tile, no input) — ` +
        `it is gated off in this environment (see resolveAuthMethods / isPhoneAuthEnabled).`,
    );
  }

  // The tile is a plain `<button onClick>`, so a click that lands BEFORE
  // hydration is a silent no-op — the button is in the SSR HTML, `onClick` is
  // not wired yet. Same class as the QA-003 race, same remedy as GATES-FIX-01 —
  // click and confirm inside ONE retry unit, so a no-op click just costs
  // another iteration. The visibility check comes first on every iteration:
  // a second press on the selected tile would close the panel again.
  await expect(async () => {
    if (await target.isVisible().catch(() => false)) return;
    await tile.click();
    await expect(target).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  return want;
}

export async function loginAs(
  page: Page,
  role: Role,
  baseURL: string,
  options: LoginOptions = {},
): Promise<LoginResult> {
  const consoleErrors: ConsoleError[] = [];
  const failedRequests: FailedRequest[] = [];
  attachObservers(page, consoleErrors, failedRequests);

  // Suppress the two first-visit overlays that otherwise sit over the login
  // form on a fresh context: the city-prompt modal (fixed inset-0 z-50, the
  // real blocker) and the cookie notice. Pre-seeding storage is more
  // deterministic than clicking through them. Keys mirror client-city.ts
  // (mr-city-slug, localStorage-primary + cookie mirror) and legal/cookie-notice.ts.
  //
  // RKN-FIX-06: the notice moved localStorage → cookie, and it is now suppressed
  // SERVER-side. A localStorage seed no longer works — it would only be honoured
  // after mount, i.e. the banner would render in the SSR HTML first.
  await page.context().addCookies([
    { name: "mr-city-slug", value: "moscow", url: baseURL },
    { name: "mr_cookie_notice", value: "1.0:n", url: baseURL },
  ]);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("mr-city-slug", "moscow");
    } catch {
      // localStorage unavailable — cookie still suppresses the city prompt.
    }
  });

  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });

  // Decide the channel BEFORE typing: `switchMode` clears the identifier.
  const channel = await resolveChannel(page, options.channel ?? "auto");
  const identity = channel === "email" ? role.email : role.phone;

  // Steps 1+2 — identity + consent, retried until the value sticks.
  // Two interacting facts force this shape:
  //   (a) the controlled React <Input> only updates its state from real input
  //       events, so .fill() sets the DOM value without firing onChange and
  //       the consent checkbox never appears — we must TYPE, not fill;
  //   (b) /login has a dev-mode hydration mismatch (server HTML != client,
  //       see QA-003) that regenerates the tree shortly after load and can
  //       wipe input typed too early.
  // Retrying the whole unit (type → consents → enabled CTA) is deterministic
  // against the hydration race.
  //
  // Both channels use `#id` here rather than the accessible name: the email
  // field's aria-label is the bare word "Email", and «Телефон» is also the
  // phone tile's label on the same screen.
  const identityInput = page.locator(channel === "email" ? "#email-input" : "#phone-input");
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
  // LOGIN-TILES-01: «Получить код» (the old «Отправить код» kept for older builds).
  const sendCodeButton = page.getByRole("button", { name: /Получить код|Отправить код/ });
  const otpFirstBox = page.getByLabel("Цифра 1 из 6");

  // GATES-FIX-01 — ОДНА retry-единица на «ввести телефон → отметить согласия →
  // отправить код → дождаться OTP-шага».
  //
  // Раньше это были два независимых блока, и между ними оставалось окно, в
  // которое попадала гонка гидратации QA-003:
  //   • дерево перестраивалось ПЕРЕД кликом → кнопка снова disabled →
  //     «locator.click: Timeout 20000ms» (роли 1-3, 6-8 в прогоне 2026-08-03);
  //   • дерево перестраивалось ПОСЛЕ клика → форма сбрасывалась, запрос не
  //     уходил → OTP-шаг не появлялся, и при этом НИ ОДНОГО HTTP-фейла в
  //     логе (роль `client` в следующем прогоне) — то есть на 429 это не
  //     списать, окно лимита было чистым.
  // Пока обе стадии не пройдены подряд, попытка не засчитывается.
  //
  // Повторная отправка безопасна: `recoverOtp` берёт ПОСЛЕДНИЙ неиспользованный
  // код, а лимит по телефону (3 / 5 мин) ограничивает число попыток сам.
  await expect(async () => {
    // Уже дошли до OTP-шага на предыдущей итерации — второй код не запрашиваем.
    if (await otpFirstBox.isVisible().catch(() => false)) return;

    await identityInput.click({ clickCount: 3 });
    await identityInput.pressSequentially(identity, { delay: 25 });
    await expect(requiredConsents).toBeVisible({ timeout: 2000 });
    for (const box of [requiredConsents, requiredConsentsPd]) {
      if (!(await box.isChecked().catch(() => false))) {
        await box.check({ timeout: 2000 });
      }
    }
    await expect(requiredConsents).toBeChecked({ timeout: 1000 });
    await expect(requiredConsentsPd).toBeChecked({ timeout: 1000 });
    // GATES-FIX-01: и, ГЛАВНОЕ, кнопка должна быть РАЗБЛОКИРОВАНА — это
    // единственный признак того, что React-состояние действительно приняло и
    // телефон, и оба согласия.
    //
    // Раньше проверка заканчивалась на `toBeChecked`, а клик жил ЗА пределами
    // retry-блока. Гонка гидратации QA-003 успевала перестроить дерево между
    // этими двумя шагами: чекбоксы сбрасывались, кнопка оставалась disabled, и
    // клик 20 секунд ждал элемент, который сам по себе уже не включится.
    // Симптом — «locator.click: Timeout 20000ms exceeded» на роли, у которой с
    // рейт-лимитом всё в порядке (в прогоне 2026-08-03 так падали роли 1-3 и
    // 6-8, а 4, 5 и 9 проходили — разброс, несовместимый с версией «кончилось
    // окно лимита»). Ассерт внутри блока превращает это в обычный ретрай.
    await expect(sendCodeButton).toBeEnabled({ timeout: 1000 });

    // Steps 3+4 — отправить и дождаться 6-боксового OTP-шага. Внутри той же
    // попытки: если форму сбросило, следующая итерация начнёт с чистого ввода.
    //
    // QA-HARNESS-EMAIL-01 — окно ожидания OTP-шага держим широким намеренно.
    // Email-роут пишет строку `OtpCode` ДО отправки, но HTTP-ответ (и только по
    // нему UI переключает шаг) ждёт `await sendEmail`. С поднятым dev-синком
    // это миллисекунды; без него, на недостижимом внешнем SMTP, замерено
    // **21–23 с** — и это не флейк, а окружение. 30 с покрывают оба случая.
    await sendCodeButton.click();
    await expect(otpFirstBox).toBeVisible({ timeout: 30_000 });
  }).toPass({ timeout: 120_000 });

  // Step 5 — recover the plaintext code from the DB and type it. Typing
  // char-by-char lets the component's focus cascade move between boxes
  // exactly like a real user; the 6th digit auto-submits (onComplete).
  // `recoverOtp` classifies the identity itself (phone vs email).
  const code = await recoverOtp(identity);
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
    channel,
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
  options: LoginOptions = {},
): Promise<{ page: Page; result: LoginResult; attempt: number }> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      const result = await loginAs(page, role, baseURL, options);
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
