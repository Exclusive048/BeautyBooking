import { describe, expect, it, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { salonInputToUtcIso, utcIsoToSalonInput } from "@/lib/schedule/datetime-input";

/**
 * LOGIC-21 — быстрый создатель записи в мастерском расписании работает по
 * часам САЛОНА, а не по часам браузера.
 *
 * Было: сетка позиционируется salon-local минутами
 * (`minuteOfDay(startAtUtc, master.timezone)`), но `WeekGridColumn` не
 * передавал `timezone` в `EmptyCellsOverlay` — поля такого в его пропах не
 * было вовсе. Обработчик клика складывал день и минуту семиаргументным
 * `new Date(y, m-1, d, h, min)`, который трактует wall-clock как БРАУЗЕРНЫЙ.
 * Модаль раскодировала обратно `getHours()`/`getMinutes()` и кодировала
 * `new Date(value).toISOString()` — весь round-trip самосогласован в таймзоне
 * браузера и ни в одной точке в таймзоне салона. Мастер видел в модали те же
 * «13:00», которые кликнул, поэтому дефект был визуально замаскирован: у
 * московского администратора екатеринбургской студии (+5 против +3) клик по
 * «13:00» сохранялся как 15:00 по салону — ошибка в два часа без предупреждения.
 *
 * Здесь два слоя. (1) Поведение: цепочка «клик → prefillTime → поле → отправка»
 * даёт один и тот же UTC-инстант при ЛЮБОЙ таймзоне хоста — прогон идёт по
 * трём разным `process.env.TZ`, включая московскую из формулировки находки.
 * (2) Структура: сами компоненты ходят через salon-конвертер и не содержат
 * host-локальных конструкторов — иначе слой (1) можно было бы удовлетворить,
 * оставив баг в UI.
 */

const EKB = "Asia/Yekaterinburg"; // +5 — не-московский якорь (skill §5)
const HOST_ZONES = ["Europe/Moscow", "UTC", "America/New_York"];

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

/**
 * Ровно то, что делает `EmptyCellsOverlay.handleClick`: день колонки
 * (salon-local date key) + salon-local минута сетки → UTC-инстант.
 */
function clickToPrefillIso(dayIso: string, startMin: number, timeZone: string): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  return salonInputToUtcIso(
    `${dayIso}T${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`,
    timeZone,
  );
}

describe("LOGIC-21 · цепочка клик → модаль → отправка не зависит от таймзоны хоста", () => {
  it("клик по 13:00 на сетке Vision (+5) даёт 08:00Z при любой таймзоне браузера", () => {
    for (const hostZone of HOST_ZONES) {
      process.env.TZ = hostZone;
      // 13:00 salon-local = 780-я минута дня — то, что мастер видит на сетке.
      expect(clickToPrefillIso("2026-07-07", 13 * 60, EKB)).toBe("2026-07-07T08:00:00.000Z");
    }
  });

  it("модаль показывает те же 13:00 салона, а не 11:00 московского зрителя", () => {
    for (const hostZone of HOST_ZONES) {
      process.env.TZ = hostZone;
      const prefill = clickToPrefillIso("2026-07-07", 13 * 60, EKB)!;
      expect(utcIsoToSalonInput(prefill, EKB)).toBe("2026-07-07T13:00");
    }
  });

  it("отправка без правки возвращает ровно тот инстант, по которому кликнули", () => {
    for (const hostZone of HOST_ZONES) {
      process.env.TZ = hostZone;
      const prefill = clickToPrefillIso("2026-07-07", 13 * 60, EKB)!;
      const shown = utcIsoToSalonInput(prefill, EKB);
      expect(salonInputToUtcIso(shown, EKB)).toBe(prefill);
    }
  });

  it("правка в поле резолвится по салону: 14:30 → 09:30Z, а не 11:30Z", () => {
    for (const hostZone of HOST_ZONES) {
      process.env.TZ = hostZone;
      const shown = utcIsoToSalonInput(clickToPrefillIso("2026-07-07", 13 * 60, EKB)!, EKB);
      expect(salonInputToUtcIso(shown.replace("T13:00", "T14:30"), EKB)).toBe(
        "2026-07-07T09:30:00.000Z",
      );
    }
  });

  it("ранняя salon-local ячейка уезжает на предыдущий UTC-день, а не теряется", () => {
    process.env.TZ = "Europe/Moscow";
    // 01:00 EKB − 5ч = 20:00Z предыдущих суток.
    expect(clickToPrefillIso("2026-07-07", 60, EKB)).toBe("2026-07-06T20:00:00.000Z");
  });

  it("сломанный день колонки не превращается в «сейчас» по часам хоста", () => {
    process.env.TZ = "Europe/Moscow";
    expect(clickToPrefillIso("not-a-date", 13 * 60, EKB)).toBeNull();
  });
});

/**
 * Структурный слой: цепочка выше проходит и по «правильно выглядящей» копии
 * логики — поэтому отдельно пиннится, что её используют САМИ компоненты.
 * Корневая причина находки была именно структурной: пропа `timezone` в
 * оверлее не существовало, и `check:tz` этого не видел (его регулярка не
 * матчит многоаргументный `new Date(...)`).
 */
const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("LOGIC-21 · компоненты ходят через salon-конвертер", () => {
  it("EmptyCellsOverlay принимает timezone и строит инстант salon-конвертером", () => {
    const source = read("features/master/components/schedule/empty-cells-overlay.tsx");
    expect(source).toMatch(/timezone:\s*string/);
    expect(source).toContain("salonInputToUtcIso");
    // Семиаргументный host-локальный конструктор — исходная причина дефекта.
    expect(source).not.toMatch(/new Date\(\s*y\s*,/);
  });

  it("WeekGridColumn передаёт timezone в оверлей (пропущенный проп и был багом)", () => {
    const source = read("features/master/components/schedule/week-grid-column.tsx");
    const overlay = /<EmptyCellsOverlay[\s\S]*?\/>/.exec(source)?.[0] ?? "";
    expect(overlay).toContain("timezone={timezone}");
  });

  it("ManualBookingModal не читает и не пишет время host-локальными методами", () => {
    const source = read("features/master/components/dashboard/manual-booking-modal.tsx");
    // MANUAL-BOOKING-SLOTS-01: времени, набранного руками, больше нет — модаль
    // выбирает свободное окошко и отправляет его UTC-инстант как есть, то есть
    // конвертировать нечего. Предвыбор из ячейки расписания (`prefillTime`)
    // уходит в пикер инстантом и сравнивается с окошками тоже инстантом.
    expect(source).toContain("OperatorSlotPicker");
    expect(source).toContain("slot.startAtUtc");
    expect(source).not.toContain('type="datetime-local"');
    const picker = read("features/booking/components/operator-slot-picker.tsx");
    for (const hostLocal of ["getHours()", "getMinutes()", "getFullYear()", "getMonth()", "getDate()"]) {
      expect(source).not.toContain(hostLocal);
      expect(picker).not.toContain(hostLocal);
    }
    // `new Date(startAt).toISOString()` — прежний путь отправки.
    expect(source).not.toMatch(/new Date\(startAt\)/);
  });
});
