import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOGIC-04 — guard «пакет отменяется целиком» (инв. #34) стоял ТОЛЬКО на
 * клиентском пути (`cancelBooking`). Мастерский путь —
 * `updateMasterBookingStatus` — параллельная реализация, до `cancelBooking` не
 * доходящая вовсе, и `bookingPackageId` в ней не встречался ни разу.
 *
 * Цена: пакет оставался `ACTIVE` с одним `REJECTED`-ребёнком, Σ child
 * `priceSnapshot` переставала сходиться с `totalKopeks` — клиент платил
 * пакетную скидку за услуги, часть которых отменена. Автоматической починки
 * нет.
 *
 * Здесь проверяется не «две строки на месте», а свойство инварианта: **каждый**
 * путь, который переводит бронь в отменяющий статус, обязан спросить о
 * принадлежности пакету. Появление третьего такого пути валит guard.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
}

describe("LOGIC-04 · мастерский путь уважает «пакет отменяется целиком»", () => {
  const source = read("src/lib/studio/bookings.service.ts");

  it("отменяющее действие спрашивает о принадлежности пакету", () => {
    expect(source).toContain("bookingPackageId");
    expect(source).toMatch(
      /\(isRejectAction \|\| isCancelAction\) && booking\.bookingPackageId/,
    );
  });

  it("ответ дословно совпадает с клиентским путём — иначе стороны разойдутся", () => {
    const client = read("src/lib/bookings/cancelBooking.ts");
    for (const text of ["Этот пакет отменяется целиком.", "PACKAGE_CANCEL_WHOLE"]) {
      expect(client, "клиентский путь").toContain(text);
      expect(source, "мастерский путь").toContain(text);
    }
  });

  it("отказ стоит ПОСЛЕ ветки отклонения переноса", () => {
    // отклонить предложенный клиентом перенос — не отмена: бронь остаётся жить,
    // и для компонента пакета это законное действие
    // Только тело `updateMasterBookingStatus`: соседние функции файла тоже
    // спрашивают о пакете (перенос компонента в студии — BOOKING-FLOW-AUDIT-
    // RESIDUALS), и поиск по всему файлу находил бы их маркер.
    const start = source.indexOf("export async function updateMasterBookingStatus");
    const next = source.indexOf("\nexport ", start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    const declineIndex = body.indexOf("if (rejectsChangeRequest)");
    const guardIndex = body.indexOf("booking.bookingPackageId) {");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(declineIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeGreaterThan(declineIndex);
  });

  it("`NO_SHOW` не гейтится — неявка на компонент ничего не отменяет", () => {
    const guardLine = source.slice(source.indexOf("(isRejectAction || isCancelAction) && booking.bookingPackageId"));
    expect(guardLine.slice(0, 120)).not.toContain("NO_SHOW");
  });
});

/**
 * Обратный guard: любой путь, пишущий отменяющий статус, обязан знать о пакетах.
 */
describe("LOGIC-04 · третий путь отмены не пройдёт молча", () => {
  const CANCELLING_WRITE = /status:\s*"REJECTED"|status:\s*input\.status/;

  const WAIVED: Record<string, string> = {
    "src/lib/bookings/package-booking.ts": "отменяет пакет ЦЕЛИКОМ — он и есть разрешённый путь",
    "src/lib/bookings/package-booking-studio.ts": "то же для студийного пакета",
  };

  function walk(relDir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(resolve(PROJECT_ROOT, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        out.push(...walk(rel));
        continue;
      }
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      if (/\.tsx?$/.test(entry.name)) out.push(rel);
    }
    return out;
  }

  const cancellers = walk("src").filter((rel) => {
    const text = read(rel);
    // запись статуса идёт либо через общий примитив (LOGIC-02), либо напрямую
    const writesBooking = text.includes("applyBookingTransition") || text.includes("booking.update");
    return CANCELLING_WRITE.test(text) && writesBooking;
  });

  it("обход находит оба известных пути отмены", () => {
    expect(cancellers).toContain("src/lib/bookings/cancelBooking.ts");
    expect(cancellers).toContain("src/lib/studio/bookings.service.ts");
  });

  it("каждый путь отмены знает о пакетах либо явно waived", () => {
    const unaware = cancellers.filter(
      (rel) => rel in WAIVED === false && !read(rel).includes("bookingPackageId"),
    );
    expect(
      unaware,
      `Путь пишет отменяющий статус и ничего не знает о пакетах — инв. #34 ` +
        `(«отмена только целиком») можно обойти через него: ${unaware.join(", ")}`,
    ).toEqual([]);
  });
});
