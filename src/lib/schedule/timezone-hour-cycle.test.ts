import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { listSourceFiles, ROOT, SRC } from "@/lib/testing/client-graph";
import { stripComments } from "@/lib/testing/source-scan";
import { formatLocalHm, getLocalTimeParts, toLocalDateKey, toUtcFromLocalDateTime } from "./timezone";

/**
 * TZ-HOUR-CYCLE-H23 (2026-10-29). На Node 20.20 (ICU 78) — на нём тогда
 * работали и CI, и боевые образы — `Intl` с
 * `hour12: false` форматирует в цикле h24: полночь — «24:00» ТОГО ЖЕ дня. Части
 * даты из `formatToParts` давали час 24, и смещение пояса ошибалось на сутки:
 * `toUtcFromLocalDateTime` переводил в UTC на день раньше ровно час
 * «24 − смещение» — 21:00 в Москве, 19:00 в Екатеринбурге, 14:00 во Владивостоке;
 * границы дня в поясе UTC уезжали на сутки, и выдача окошек теряла записи дня.
 * На Node 24 (ICU 77) было h23, поэтому локально всё зеленело. На Node 26
 * (ICU 78.3, версия проекта с NODE-LTS-UPGRADE) снова h23 — цикл зависит от
 * движка, поэтому правило остаётся: час — только `hourCycle: "h23"`.
 *
 * Поведенческая половина краснеет только на движке с h24, поэтому есть и
 * вторая — по исходникам: `hour12: false` (и `hourCycle: "h24"`) в проекте не
 * пишется, час — только `hourCycle: "h23"` (как в `lib/ui/fmt.ts`).
 *
 * @probe 2026-10-29 — Node 20.20.2 (`npx -p node@20`), в `timezone.ts` возвращён
 * `hour12: false` и снята страховка `% 24`: красные «полночь — час 0…», «21:00 по Москве…» (получено
 * 2026-11-02T18:00Z вместо 2026-11-03T18:00Z) и «19:00 в Екатеринбурге…», а с
 * ними шесть тестов `slots.test.ts`. На Node 24 с тем же возвратом краснеет
 * «в исходниках нет hour12: false» (`src/lib/schedule/timezone.ts`). Возвращено —
 * зелёный на обеих версиях.
 */

describe("TZ-HOUR-CYCLE-H23 · части даты — цикл h23 на любом движке", () => {
  it("полночь — час 0 того же дня, а не 24", () => {
    const midnight = new Date("2026-03-03T00:00:00.000Z");
    expect(getLocalTimeParts(midnight, "UTC")).toEqual({ hour: 0, minute: 0 });
    expect(formatLocalHm(midnight, "UTC")).toBe("00:00");
    expect(toLocalDateKey(midnight, "UTC")).toBe("2026-03-03");
    // Местная полночь Москвы — 21:00Z накануне.
    expect(formatLocalHm(new Date("2026-03-02T21:00:00.000Z"), "Europe/Moscow")).toBe("00:00");
  });

  it("начало суток в поясе UTC — эта же дата", () => {
    const day = new Date("2026-03-03T12:00:00.000Z");
    expect(toUtcFromLocalDateTime(day, 0, 0, "UTC").toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });

  it("21:00 по Москве — тот же день (догадка 21:00Z = местная полночь)", () => {
    const day = new Date("2026-11-03T09:00:00.000Z");
    expect(toUtcFromLocalDateTime(day, 21, 0, "Europe/Moscow").toISOString()).toBe("2026-11-03T18:00:00.000Z");
    expect(toUtcFromLocalDateTime(day, 21, 30, "Europe/Moscow").toISOString()).toBe("2026-11-03T18:30:00.000Z");
  });

  it("19:00 в Екатеринбурге и 14:00 во Владивостоке — тот же день", () => {
    const day = new Date("2026-11-03T07:00:00.000Z");
    expect(toUtcFromLocalDateTime(day, 19, 0, "Asia/Yekaterinburg").toISOString()).toBe(
      "2026-11-03T14:00:00.000Z",
    );
    expect(toUtcFromLocalDateTime(day, 14, 0, "Asia/Vladivostok").toISOString()).toBe("2026-11-03T04:00:00.000Z");
  });
});

function listScriptFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listScriptFiles(full, acc);
    else if (/\.(m?[jt]s)$/.test(entry.name) && !/\.test\.(m?[jt]s)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe("TZ-HOUR-CYCLE-H23 · в исходниках час форматируется только в цикле h23", () => {
  it("в исходниках нет hour12: false и hourCycle «h24»", () => {
    const files = [
      ...listSourceFiles(SRC),
      ...listSourceFiles(join(ROOT, "prisma")),
      ...listScriptFiles(join(ROOT, "scripts")),
    ];
    // Сторож не пустой: обход видит и модуль поясов, и сиды.
    expect(files.some((file) => file.endsWith(join("schedule", "timezone.ts")))).toBe(true);
    expect(files.some((file) => file.includes(join("prisma", "seeds")))).toBe(true);

    const offenders = files.filter((file) =>
      /hour12\s*:\s*false|hourCycle\s*:\s*["']h24["']/.test(stripComments(readFileSync(file, "utf8"))),
    );
    expect(offenders.map((file) => relative(ROOT, file).replaceAll("\\", "/"))).toEqual([]);
  });
});
