import { describe, expect, it } from "vitest";

import { formatBookingWhenLabel } from "./format-booking-when";

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function resolveNotificationsDir(): string {
  return resolve(process.cwd(), "src/lib/notifications");
}

function listNotificationSources(): string[] {
  const dir = resolveNotificationsDir();
  return readdirSync(dir)
    .filter((entry) => /\.ts$/.test(entry) && !/\.test\.ts$/.test(entry))
    .map((entry) => join(dir, entry));
}

/**
 * HARDENING-09 #13 — the shared salon-tz "when" formatter (used by both the
 * in-app lifecycle path and the Telegram reminder). The SKILL-TZ anchor: an
 * 08:00Z instant must render 13:00 for a Yekaterinburg (+5) salon, with an
 * explicit GMT label, regardless of the recipient's own clock.
 */

const INSTANT = new Date("2026-07-07T08:00:00Z");

describe("formatBookingWhenLabel", () => {
  it("renders a non-Moscow salon (Yekaterinburg, GMT+5) in salon-local time with a zone label", () => {
    const out = formatBookingWhenLabel(INSTANT, "Asia/Yekaterinburg");
    expect(out).toContain("13:00"); // 08:00Z + 5, NOT raw 08:00
    expect(out).toContain("07.07");
    expect(out).toContain("GMT+5");
    expect(out).toContain("Екатеринбург");
    expect(out).not.toContain("08:00");
  });

  it("renders the Moscow control (GMT+3) correctly — guards against a UTC-vs-salon regression", () => {
    const out = formatBookingWhenLabel(INSTANT, "Europe/Moscow");
    expect(out).toContain("11:00"); // 08:00Z + 3
    expect(out).toContain("GMT+3");
    expect(out).toContain("Москва");
  });

  it("returns null when there is no instant (caller falls back to the slot label)", () => {
    expect(formatBookingWhenLabel(null, "Asia/Yekaterinburg")).toBeNull();
  });
});

/**
 * LOGIC-27 — рядом с корректным путём лежал мёртвый билдер
 * `createBookingNotifications` (`notifications/service.ts`), который собирал
 * тело уведомления с захардкоженным `timeZone: "UTC"` и БЕЗ метки зоны — ровно
 * тот анти-паттерн, который проект вычищал в HARDENING-09 #13. Получателями
 * были бы и клиент, и мастер; `booking.provider.timezone` функция загружала,
 * но в билдер не передавала.
 *
 * Боевых вызовов у него было ноль, поэтому сегодняшнего вреда не существовало.
 * Опасность была в другом: следующий, кто пишет уведомление «по образцу
 * существующего», взял бы этот образец. Функция удалена; этот guard сторожит
 * её возвращение и, шире, любое серверное уведомление о времени брони,
 * собранное мимо `formatBookingWhenLabel`.
 */
describe("серверные уведомления о времени брони — только через formatBookingWhenLabel (LOGIC-27)", () => {
  const NOTIFICATIONS_DIR = resolveNotificationsDir();

  it("мёртвый билдер с timeZone: \"UTC\" не вернулся", () => {
    for (const file of listNotificationSources()) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("createBookingNotifications");
      // Сырой UTC-рендер в домене уведомлений допустим только с явной пометкой
      // намерения (`tz-ok:`), как это принято в проекте.
      const utcRenders = source
        .split("\n")
        .filter((line) => /timeZone:\s*["']UTC["']/.test(line) && !line.includes("tz-ok:"));
      expect(utcRenders, `${file}: сырой UTC без пометки намерения`).toEqual([]);
    }
    expect(NOTIFICATIONS_DIR).toBeTruthy();
  });
});
