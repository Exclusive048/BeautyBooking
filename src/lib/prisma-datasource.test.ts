import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DB_STATEMENT_TIMEOUT_MS, withStatementTimeout } from "./prisma-datasource";

/**
 * RES-24 — у одного запроса к БД есть верхняя граница.
 *
 * Проверяется форма строки подключения, а не сам Postgres: живой прогон
 * (`options=-c statement_timeout=1500` + `SELECT pg_sleep(5)`) сделан отдельно и
 * дал `57014 canceling statement due to statement timeout` через 1506 мс — то
 * есть параметр доезжает до сервера и действительно отменяет запрос. Здесь
 * пиннится то, что доехать он может: пробел закодирован (иначе Postgres не
 * примет startup-параметр), разделитель выбран по наличию query-строки, и явно
 * заданный оператором `options` не затирается.
 */

describe("withStatementTimeout (RES-24)", () => {
  it("дописывает statement_timeout к URL без query-строки", () => {
    const url = withStatementTimeout("postgresql://u:p@host:5432/db");
    expect(url).toBe(
      `postgresql://u:p@host:5432/db?options=${encodeURIComponent(`-c statement_timeout=${DB_STATEMENT_TIMEOUT_MS}`)}`
    );
    // пробел обязан быть закодирован — сырой он ломает разбор startup-параметра
    expect(url).not.toContain(" ");
    expect(url).toContain("statement_timeout");
  });

  it("дописывает через & к URL, где query-строка уже есть", () => {
    const url = withStatementTimeout("postgresql://u:p@host:5432/db?schema=public");
    expect(url).toContain("?schema=public&options=");
    expect(url?.match(/\?/g)).toHaveLength(1);
  });

  it("не трогает URL, где оператор задал options сам — это путь переопределения", () => {
    const explicit = "postgresql://u:p@host:5432/db?options=-c%20statement_timeout%3D5000";
    expect(withStatementTimeout(explicit)).toBe(explicit);

    const explicitSecond = "postgresql://u:p@host:5432/db?schema=public&options=-c%20lock_timeout%3D1000";
    expect(withStatementTimeout(explicitSecond)).toBe(explicitSecond);
  });

  it("отсутствующий URL возвращается как есть — Prisma берёт datasource из схемы", () => {
    expect(withStatementTimeout(undefined)).toBeUndefined();
    expect(withStatementTimeout("")).toBe("");
  });

  it("граница конечна и не абсурдно велика", () => {
    expect(DB_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DB_STATEMENT_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});

/**
 * Обоих клиентов Prisma нужно держать под одной границей: пуловый (`prisma.ts`)
 * и прямой (`prisma-direct.ts`, `transfer-master` + подтверждение отклика
 * модели). Починить один и оставить второй — ровно та асимметрия, которую
 * кампания разбирала в RES-03/-15 и LOGIC-16, и заметить её нечем: клиент
 * молчит, пока запрос не зависнет.
 */
describe("оба клиента Prisma создаются с границей (RES-24)", () => {
  const read = (file: string): string =>
    readFileSync(path.join(process.cwd(), "src", "lib", file), "utf-8");

  it("prisma.ts передаёт datasourceUrl через withStatementTimeout", () => {
    const source = read("prisma.ts");
    expect(source).toContain("withStatementTimeout");
    expect(source).toMatch(/datasourceUrl:\s*withStatementTimeout\(/);
  });

  it("prisma-direct.ts прогоняет DIRECT_URL через тот же хелпер", () => {
    const source = read("prisma-direct.ts");
    expect(source).toContain("withStatementTimeout");
    expect(source).toMatch(/url:\s*withStatementTimeout\(/);
  });
});
