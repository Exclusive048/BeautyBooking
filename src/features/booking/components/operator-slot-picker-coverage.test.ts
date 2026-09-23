import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MANUAL-BOOKING-SLOTS-01 / MOVE-BOOKING-SLOTS-01 — время ЗАПИСИ выбирается из
 * свободных окошек, а не вбивается руками. Решение владельца: «всё должно быть
 * через окошки». `datetime-local` пропускал занятое время до отказа сервера и
 * трактовался в поясе браузера.
 *
 * Сторож выводит набор из дерева: любой `type="datetime-local"` в `src/features`
 * вне списка разрешённых валит CI. Разрешён только диалог перерывов студии —
 * блокировка времени это не запись, окошек для неё не существует.
 *
 * @probe 2026-09-23 — в `move-booking-dialog.tsx` возвращён
 * `<Input type="datetime-local" …/>`: красный «datetime-local только там, где
 * это не запись». Возвращено — зелёный.
 */

const SRC = join(process.cwd(), "src", "features");

const ALLOWED_DATETIME_LOCAL = new Set([
  // Перерыв/блокировка времени мастера — не запись: «свободных окошек» для
  // неё нет, администратор закрывает произвольный отрезок.
  "studio-cabinet/schedule/components/dialogs/manage-breaks-dialog.tsx",
]);

const BOOKING_TIME_SURFACES = [
  "master/components/dashboard/manual-booking-modal.tsx",
  "studio-cabinet/schedule/components/dialogs/create-booking-dialog.tsx",
  "studio-cabinet/schedule/components/dialogs/move-booking-dialog.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(full);
  }
  return out;
}

const rel = (full: string) => relative(SRC, full).split(sep).join("/");

describe("время записи — только через окошки", () => {
  it("datetime-local только там, где это не запись", () => {
    const offenders = walk(SRC)
      .filter((file) => /type=["']datetime-local["']/.test(readFileSync(file, "utf8")))
      .map(rel)
      .filter((file) => !ALLOWED_DATETIME_LOCAL.has(file));
    expect(offenders).toEqual([]);
  });

  it("поверхности записи выбирают время общим OperatorSlotPicker", () => {
    for (const surface of BOOKING_TIME_SURFACES) {
      const source = readFileSync(join(SRC, surface), "utf8");
      expect(source, surface).toMatch(/<OperatorSlotPicker\b/);
    }
  });
});
