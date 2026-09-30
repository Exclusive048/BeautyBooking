/**
 * PERF-11 guard — браузерный рантайм `@prisma/client` не попадает в клиентский бандл.
 *
 * `@prisma/client` в `serverExternalPackages` (`next.config.ts`) на клиентский
 * граф НЕ влияет — тот список только серверный. Поэтому единственный **value**-импорт
 * из `@prisma/client` где-нибудь в дереве, достижимом от `"use client"`, молча
 * затаскивает в браузер `index-browser.js` (~66 kB parsed / 21 kB gzip) — билд при
 * этом зелёный, вес просто появляется. Именно так это и прожило: 15 компонентов
 * импортировали enum'ы значением ради `BookingStatus.CONFIRMED`.
 *
 * Тест обходит граф от каждого `"use client"`-файла по **value**-рёбрам (импорты
 * `import type` / инлайн-`type` стираются компилятором и в бандл не идут) и требует,
 * чтобы ни один достигнутый модуль не импортировал `@prisma/client` значением.
 * Значения enum'ов для клиента живут в `@/lib/prisma-enums`.
 *
 * Не-вакуумность: тест прогонялся с восстановленным `import { BookingStatus } from
 * "@prisma/client"` в `bookings-filters.tsx` — падал с указанием файла и цепочки.
 */
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { readImports, ROOT, SRC, walkClientGraph } from "@/lib/testing/client-graph";

import * as PrismaRuntime from "@prisma/client";

import * as Mirrors from "./prisma-enums";

describe("PERF-11 — @prisma/client не попадает в клиентский бандл", () => {
  it("ни один модуль клиентского графа не импортирует @prisma/client значением", () => {
    const { visited, via } = walkClientGraph();
    expect(visited.size).toBeGreaterThan(200); // граф действительно обойден

    const violations: string[] = [];
    for (const file of [...visited].sort()) {
      const names = readImports(file).prismaValueNames;
      if (names === null) continue;
      const importer = via.get(file);
      violations.push(
        `${relative(ROOT, file)} — { ${names.join(", ")} }` +
          (importer ? ` (через ${relative(ROOT, importer)})` : " ('use client')"),
      );
    }

    expect(
      violations,
      "value-импорт @prisma/client тянет index-browser.js (~66 kB) в браузер; " +
        "значения enum'ов — из @/lib/prisma-enums, типы — через `import type`",
    ).toEqual([]);
    // Обход всего графа импортов компилятором: под нагрузкой полного прогона
    // пяти секунд по умолчанию не хватает.
  }, 30_000);

  it("сам @/lib/prisma-enums не импортирует @prisma/client значением", () => {
    expect(readImports(join(SRC, "lib", "prisma-enums.ts")).prismaValueNames).toBeNull();
  });
});

describe("зеркала enum'ов совпадают с рантаймом Prisma", () => {
  // Компилятор уже держит exhaustive-ность (`satisfies EnumMirror<…>`); это второй,
  // независимый слой — на случай, если `satisfies` в зеркале однажды ослабят.
  const MIRRORED = [
    "AccountType",
    "BillingPaymentStatus",
    "BookingSource",
    "BookingStatus",
    "DiscountType",
    "MediaEntityType",
    "NotificationType",
    "PlanTier",
    "ProviderType",
    "ReviewReportReason",
    "ReviewTargetType",
    "ScheduleChangeRequestStatus",
    "SubscriptionScope",
    "SubscriptionStatus",
  ] as const;

  it.each(MIRRORED)("%s", (name) => {
    const mirror = (Mirrors as unknown as Record<string, Record<string, string>>)[name];
    const runtime = (PrismaRuntime as unknown as Record<string, Record<string, string>>)[name];
    expect(mirror, `в @/lib/prisma-enums нет зеркала ${name}`).toBeDefined();
    expect(runtime, `в @prisma/client нет enum ${name}`).toBeDefined();
    expect(mirror).toEqual(runtime);
  });
});
