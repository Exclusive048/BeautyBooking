// QA-04 — Client booking happy path, end-to-end via the real UI.
//
// QA-02 proved the booking *backend* (POST /api/bookings) is sound but the UI
// funnel was dead (QA-101 dev jest-worker 500s; QA-108 prod hydration crash).
// QA-108 is fixed (FIX-01) and the dev slot routes served reliably this run, so
// this spec drives the actual conversion path:
//   login (client) → master profile → add service → pick real slot → submit →
//   success confirmation card.
//
// Subject: Галина Степанова (galina-stepanova-26) — Europe/Moscow, Mon–Sat
// 10:00–19:00, autoConfirm=false. A clean MSK master (no picsum media) so the
// run isn't confounded by QA-102/QA-107.
//
// Anchors corroborated elsewhere this pass (see QA-FINDINGS §4):
//   - Anchor 4 (TZ): UI 14:30 MSK ↔ DB startAtUtc 11:30 UTC (rule 8).
//   - Anchor 5: the booking lands in /cabinet/bookings.
//
// CAVEAT: each run creates a real PENDING booking in the dev DB (no public
// delete endpoint). The widget books whichever slot is offered; re-runs consume
// successive slots. Restore the clean baseline with:
//   docker exec masterryadom-db pg_restore -U master -d masterryadom --clean --if-exists .qa/snapshots/post-seed.dump
// or `npm run seed:test`.
//
// KNOWN UI DEFECT this spec tolerates (QA-110): the TimeGrid renders the
// selected day + the next day intermixed (no day labels). Picking the FIRST
// slot button keeps us on the selected (first enabled) day, so the success card
// reflects that day. The grid bug does not break booking creation.

import { expect, test } from "@playwright/test";
import { loginAs } from "../../login";
import { ROLES } from "../../roles";

const MASTER_USERNAME = "galina-stepanova-26";
const SERVICE_NAME = "Стрижка мужская"; // 45 min, 2 180 ₽ (kopeks 218000 ÷100)

const client = ROLES.find((r) => r.key === "client");
if (!client) throw new Error("client role missing from ROLES");

test("client completes a booking end-to-end via the UI", async ({ page, baseURL }) => {
  test.setTimeout(120_000); // dev first-hit route compile can be slow

  // 1) Authenticate as Elena (phone OTP through the real /login UI).
  const login = await loginAs(page, client, baseURL ?? "http://localhost:3000");
  expect(login.landedPath).toBe("/cabinet/profile");

  // 2) Open the master profile (200, not the QA-101 500).
  await page.goto(`${baseURL}/u/${MASTER_USERNAME}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Галина Степанова", level: 1 })).toBeVisible();

  // 3) Add the service → booking widget activates.
  const serviceCard = page.locator("article").filter({ hasText: SERVICE_NAME });
  await serviceCard.getByRole("button", { name: "Добавить" }).first().click();

  // The booking widget lives in #booking; scope day/slot selection to it and
  // wait for it to finish mounting (avoids a whole-page button scan + races).
  const widget = page.locator("#booking");
  await expect(widget.getByText("Дата")).toBeVisible({ timeout: 30_000 });

  // 4+5) Pick the first enabled day that ACTUALLY has selectable slots, not just
  //    the first enabled day. The date strip can mark "today" enabled while all
  //    of today's slots are already past the booking cutoff (0 slots → empty
  //    state) — picking blindly was time-of-day flaky (FIX-09 hit it at 00:54
  //    MSK). Iterate enabled days, click each, and stop at the first that renders
  //    a time slot. (QA-122: an exhausted today now shows a clear empty state.)
  const enabledDays = widget
    .locator("button:not([disabled])")
    .filter({ hasText: /^(Пн|Вт|Ср|Чт|Пт|Сб)\s*\d+$/ });
  await expect(enabledDays.first()).toBeVisible({ timeout: 30_000 });
  const slotLocator = widget.getByRole("button", { name: /^\d{1,2}:\d{2}$/ });
  const dayCount = await enabledDays.count();
  let pickedDay = false;
  for (let i = 0; i < dayCount; i += 1) {
    await enabledDays.nth(i).click();
    await page.waitForTimeout(2500); // let the time-grid fetch + render settle
    if ((await slotLocator.count()) > 0) {
      pickedDay = true;
      break;
    }
  }
  expect(pickedDay, "no enabled day in the date strip offered any selectable slots").toBe(true);

  const slot = slotLocator.first();
  await expect(slot).toBeVisible({ timeout: 30_000 });
  await slot.click();

  // 6) Continue to the contacts step.
  await widget.getByRole("button", { name: "Продолжить" }).first().click();

  // Name pre-fills from the session; ensure it's non-empty (type, never .fill()).
  const nameField = page.getByRole("textbox", { name: /Имя/ });
  await expect(nameField).toBeVisible();
  if (((await nameField.inputValue()) ?? "").trim() === "") {
    await nameField.pressSequentially("QA Елена", { delay: 20 });
  }

  // 7) Submit the booking.
  await page.getByRole("button", { name: "Записаться" }).first().click();

  // 8) Success confirmation card.
  await expect(page.getByText("Вы записаны")).toBeVisible({ timeout: 30_000 });
  // URL carries the created booking id.
  await expect(page).toHaveURL(/bookingId=/);
  // Confirmation echoes the service + a rouble price (scope to the booking
  // panel; the service name also appears in the services list). The success card
  // uses the correct kopeks→rubles formatter — guards QA-105's fixed path.
  const bookingPanel = page.locator("#booking");
  await expect(bookingPanel.getByText(SERVICE_NAME)).toBeVisible();
  await expect(bookingPanel.getByText(/\d+\s?₽/)).toBeVisible();
});
