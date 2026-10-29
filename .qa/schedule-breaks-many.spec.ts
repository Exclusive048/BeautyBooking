import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { loginAs } from "./login";
import { clearOtpRateLimit, psql } from "./otp";
import { ROLES } from "./roles";

/**
 * SCHEDULE-BREAKS-MANY — живая проверка пересчёта расписания (2026-10-29).
 * Мастер Анна (Москва, GMT+3). Через API кабинета, как это делает интерфейс:
 *   1. «Каждый раз по-разному» 10:00–18:00 без перерывов, два дня покрашены.
 *   2. Повторное применение режима с другими часами и тремя перерывами —
 *      покрашенные дни сразу живут по новым часам, рабочий день палитры один.
 *   3. День со своими часами без перерывов внутри недели с обедом — обеда нет.
 * ⚠️ Меняет расписание Анны в dev-БД (вернуть: `npm run seed:test:reset && npm run seed:test`).
 */

const OUT = process.env.BREAKS_OUT ?? ".qa/diagnostics/schedule-breaks-many";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const MSK_OFFSET_H = 3;

type Slot = { startAtUtc: string };

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mskHm(iso: string): string {
  const d = new Date(iso);
  const h = (d.getUTCHours() + MSK_OFFSET_H) % 24;
  return `${String(h).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function minutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h! * 60 + m!;
}

async function json<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const body = (await res.json()) as { ok: boolean; data?: T; error?: { message: string; code: string } };
  if (!res.ok() || !body.ok) throw new Error(`${res.status()} ${JSON.stringify(body.error)}`);
  return body.data as T;
}

type CalendarDay = { date: string; isWorking: boolean; start: string | null; end: string | null; breaks: Array<{ start: string; end: string }>; templateId: string | null; painted: boolean };
type Calendar = { todayKey: string; days: CalendarDay[] };

test("SCHEDULE-BREAKS-MANY · расписание пересчитывается под сохранённое", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  const master = ROLES.find((r) => r.key === "master")!;
  clearOtpRateLimit([master.phone]);
  await loginAs(page, master, BASE);
  const api = page.request;

  const providerId = psql(
    `select p.id from "Provider" p join "MasterProfile" mp on mp."providerId" = p.id join "UserProfile" u on u.id = mp."userId" where u.phone = '${master.phone}'`,
  ).trim();
  const service = psql(
    `select id || '|' || "durationMin" from "Service" where "providerId" = '${providerId}' and "isActive" = true and "isEnabled" = true order by "durationMin" asc limit 1`,
  ).trim();
  const [serviceId, durationRaw] = service.split("|");
  const duration = Number(durationRaw);
  expect(providerId).not.toBe("");
  expect(serviceId).toBeTruthy();

  const calendar = async () =>
    (await json<{ calendar: Calendar }>(await api.get(`${BASE}/api/cabinet/master/schedule/calendar`))).calendar;
  const slotsOn = async (date: string) => {
    const data = await json<{ slots: Slot[] }>(
      await api.get(`${BASE}/api/masters/${providerId}/availability?serviceId=${serviceId}&from=${date}&to=${date}&manual=1&limit=200`),
    );
    return data.slots.map((s) => mskHm(s.startAtUtc));
  };
  const applyManual = async (startsOn: string, start: string, end: string, breaks: Array<{ start: string; end: string }>) =>
    json(
      await api.put(`${BASE}/api/cabinet/master/schedule/pattern`, {
        data: {
          templates: [{ label: "Рабочий день", startTime: start, endTime: end, breaks, scheduleMode: "FLEXIBLE", fixedSlotTimes: [] }],
          pattern: { kind: "CYCLE", cycleDays: 1, anchorOn: startsOn, startsOn, endsOn: null, days: [null], resumePrevious: false },
        },
      }),
    );
  const workingDayIds = () =>
    psql(
      `select id from "ScheduleTemplate" where "providerId" = '${providerId}' and label = 'Рабочий день' order by "createdAt" desc`,
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const paint = async (dates: string[], action: Record<string, unknown>) =>
    json(await api.put(`${BASE}/api/cabinet/master/schedule/calendar`, { data: { dates, action } }));

  const report: Record<string, unknown> = { providerId, serviceId, duration };
  const today = (await calendar()).todayKey;
  const d1 = addDays(today, 3);
  const d2 = addDays(today, 4);
  const d3 = addDays(today, 5);

  // 1. Ручной режим 10–18, два дня покрашены «Рабочим днём».
  await applyManual(today, "10:00", "18:00", []);
  const [firstId] = workingDayIds();
  expect(firstId).toBeTruthy();
  await paint([d1, d2], { kind: "template", templateId: firstId });
  const before = await slotsOn(d1);
  report.step1 = { workingDayIds: workingDayIds(), firstSlot: before[0], lastSlot: before.at(-1), count: before.length };
  expect(before[0]).toBe("10:00");
  expect(minutes(before.at(-1)!) + duration).toBeLessThanOrEqual(minutes("18:00"));

  // 2. Повторное применение: 09–20 и три перерыва — дни уже покрашены и должны пересчитаться.
  const breaks = [
    { start: "12:00", end: "12:30" },
    { start: "15:00", end: "15:15" },
    { start: "17:00", end: "17:30" },
  ];
  await applyManual(today, "09:00", "20:00", breaks);
  const ids = workingDayIds();
  const cal2 = await calendar();
  const day1 = cal2.days.find((d) => d.date === d1)!;
  const day2 = cal2.days.find((d) => d.date === d2)!;
  const after = await slotsOn(d1);
  const after2 = await slotsOn(d2);
  report.step2 = { workingDayIds: ids, day1, day2, firstSlot: after[0], lastSlot: after.at(-1), count: after.length };
  expect(ids).toHaveLength(1);
  for (const day of [day1, day2]) {
    expect(day).toMatchObject({ isWorking: true, start: "09:00", end: "20:00", templateId: ids[0] });
    expect(day.breaks).toEqual(breaks);
  }
  for (const list of [after, after2]) {
    expect(list[0]).toBe("09:00");
    expect(minutes(list.at(-1)!) + duration).toBeLessThanOrEqual(minutes("20:00"));
    for (const hm of list) {
      const s = minutes(hm);
      for (const b of breaks) {
        // Окошко не пересекает перерыв.
        expect(s + duration <= minutes(b.start) || s >= minutes(b.end), `${hm} пересекает ${b.start}–${b.end}`).toBe(true);
      }
    }
  }

  // 3. День со своими часами без перерывов — обеда «из графика» нет.
  await paint([d3], { kind: "template", templateId: ids[0] });
  await paint([d3], { kind: "hours", startTime: "11:00", endTime: "16:00", breaks: [] });
  const day3 = (await calendar()).days.find((d) => d.date === d3)!;
  const own = await slotsOn(d3);
  report.step3 = { day3, firstSlot: own[0], lastSlot: own.at(-1), count: own.length, has1200: own.includes("12:00") };
  expect(day3).toMatchObject({ isWorking: true, start: "11:00", end: "16:00", templateId: null, painted: true });
  expect(day3.breaks).toEqual([]);
  expect(own[0]).toBe("11:00");
  expect(own).toContain("12:00");

  // 4. Неделя с обедом 13–14, день со своими часами без перерывов — обед графика на него не переносится.
  const monday = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  await json(
    await api.put(`${BASE}/api/cabinet/master/schedule/pattern`, {
      data: {
        templates: [{ startTime: "10:00", endTime: "19:00", breaks: [{ start: "13:00", end: "14:00" }], scheduleMode: "FLEXIBLE", fixedSlotTimes: [] }],
        pattern: { kind: "WEEK", cycleDays: 7, anchorOn: monday, startsOn: today, endsOn: null, days: [0, 0, 0, 0, 0, 0, 0], resumePrevious: false },
      },
    }),
  );
  const d4 = addDays(today, 6);
  const d5 = addDays(today, 7);
  await paint([d4], { kind: "reset" });
  await paint([d5], { kind: "hours", startTime: "11:00", endTime: "16:00", breaks: [] });
  const cal4 = await calendar();
  const weekDay = cal4.days.find((d) => d.date === d4)!;
  const ownDay = cal4.days.find((d) => d.date === d5)!;
  const weekSlots = await slotsOn(d4);
  const ownSlots = await slotsOn(d5);
  report.step4 = { weekDay, ownDay, weekSlots, ownSlots };
  expect(weekDay.breaks).toEqual([{ start: "13:00", end: "14:00" }]);
  expect(weekSlots).not.toContain("13:00");
  expect(ownDay).toMatchObject({ start: "11:00", end: "16:00", templateId: null });
  expect(ownDay.breaks).toEqual([]);
  expect(ownSlots).toContain("13:00");

  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  // Шторка дня в интерфейсе: открывается с сохранёнными перерывами.
  await page.goto(`${BASE}/cabinet/master/schedule/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "calendar.png"), fullPage: false });
});
