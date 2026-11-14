import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { ROLES } from "./roles";
import { contextForRole } from "./session";

/**
 * BOOKING-DATE-CALENDAR — живая проверка ручной записи в кабинете студии на
 * графике «2 через 2» с 9 до 20 (сценарий владельца). Ставит график профилю
 * Марины в студии Vision через тот же роут, что окно «Настроить график»,
 * затем читает сводку дней (`?days=1&manual=1`) и открывает «Новая запись».
 *
 * ⚠️ Меняет расписание в dev-базе: перед прогоном сохраните строки графика,
 * после — верните (см. отчёт задачи).
 */

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const OUT = process.env.BDC_OUT ?? ".qa/diagnostics/booking-date-calendar";
const STUDIO_ID = "cmv4zzukc01ogvlyk4rq3yhfz";
const MARINA_STUDIO_PROFILE = "cmv4zzykp005vvlk8kizq1vcz";
const TODAY = process.env.BDC_TODAY ?? "2026-11-13";

test("ручная запись студии: график 2/2 9–20 даёт свободные дни и окошки", async ({ browser }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  const role = ROLES.find((item) => item.key === "studio-admin")!;
  const { context, page } = await contextForRole(browser, role, BASE);

  const put = await page.request.put(
    `${BASE}/api/cabinet/master/schedule/pattern?studioId=${STUDIO_ID}&masterId=${MARINA_STUDIO_PROFILE}`,
    {
      headers: { "content-type": "application/json", origin: BASE },
      data: {
        templates: [
          { startTime: "09:00", endTime: "20:00", breaks: [], scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
        ],
        pattern: {
          kind: "CYCLE",
          cycleDays: 4,
          anchorOn: TODAY,
          startsOn: TODAY,
          endsOn: null,
          days: [0, 0, null, null],
          resumePrevious: false,
        },
      },
    },
  );
  const putBody = await put.text();
  console.log("PUT pattern", put.status(), putBody.slice(0, 300));
  expect(put.status()).toBe(200);

  // Услуга, которую Марина делает в студии, — из опций ручной записи.
  const options = await page.request.get(`${BASE}/api/cabinet/studio/booking-options`);
  const optionsJson = (await options.json()) as {
    data?: { masters?: Array<{ id: string; serviceIds: string[] }> };
  };
  const marina = optionsJson.data?.masters?.find((item) => item.id === MARINA_STUDIO_PROFILE);
  console.log("options", options.status(), JSON.stringify(marina));
  expect(marina?.serviceIds.length ?? 0).toBeGreaterThan(0);
  const offer = { serviceId: marina!.serviceIds[0]! };

  const daysRes = await page.request.get(
    `${BASE}/api/masters/${MARINA_STUDIO_PROFILE}/availability?serviceId=${offer!.serviceId}&manual=1&days=1&from=${TODAY}&to=2026-12-31`,
  );
  const daysJson = (await daysRes.json()) as { data?: { days?: Array<{ date: string; status: string }> } };
  const summary = (daysJson.data?.days ?? []).map((day) => `${day.date.slice(5)}:${day.status}`).join(" ");
  console.log("days", daysRes.status(), summary);
  expect(daysRes.status()).toBe(200);
  // 2/2 от сегодня: два рабочих дня, два выходных.
  const statuses = (daysJson.data?.days ?? []).slice(0, 8).map((day) => day.status);
  expect(statuses.slice(2, 4)).toEqual(["off", "off"]);
  expect(statuses.slice(4, 6).every((status) => status !== "off")).toBe(true);

  // Окошки рабочего дня через два дня от сегодня (14-е может быть почти прошедшим).
  const workDay = (daysJson.data?.days ?? [])[4]!.date;
  const slotsRes = await page.request.get(
    `${BASE}/api/masters/${MARINA_STUDIO_PROFILE}/availability?serviceId=${offer!.serviceId}&manual=1&from=${workDay}&to=${workDay}`,
  );
  const slotsText = await slotsRes.text();
  console.log("slots", workDay, slotsRes.status(), slotsText.slice(0, 400));
  expect(slotsRes.status()).toBe(200);

  for (const viewport of [
    { width: 1440, height: 900, name: "1440" },
    { width: 390, height: 844, name: "390" },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${BASE}/cabinet/studio/calendar?date=${workDay}`, { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog").first();
    // Клик до гидратации теряется — повторяем, пока окно не откроется.
    await expect(async () => {
      await page.getByRole("button", { name: "Добавить запись" }).first().click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const selects = dialog.locator("select");
    await selects.nth(0).selectOption(MARINA_STUDIO_PROFILE);
    await selects.nth(1).selectOption(offer!.serviceId);
    const calendar = dialog.getByTestId("operator-slot-picker-calendar");
    await expect(calendar.locator('[data-status="free"]').first()).toBeVisible({ timeout: 20_000 });
    const cells = await calendar
      .locator("[data-date]")
      .evaluateAll((els) =>
        els
          .map((el) => `${el.getAttribute("data-date")!.slice(5)}:${el.getAttribute("data-status")!.slice(0, 3)}${el.getAttribute("aria-pressed") === "true" ? "*" : ""}`)
          .join(" "),
      );
    console.log("dialog calendar", viewport.name, cells);
    // Выходной по графику выбирается и объясняет, почему окошек нет.
    await calendar.locator('[data-status="off"]').first().click();
    await page.waitForTimeout(1200);
    await dialog.screenshot({ path: path.join(OUT, `studio-create-off-${viewport.name}.png`) });
    await calendar.locator(`[data-date="${workDay}"]`).click();
    await expect(dialog.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(OUT, `studio-create-${viewport.name}.png`) });
    await calendar.scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: path.join(OUT, `studio-create-dialog-${viewport.name}.png`) });
    await page.keyboard.press("Escape");
  }

  await context.close();
});
