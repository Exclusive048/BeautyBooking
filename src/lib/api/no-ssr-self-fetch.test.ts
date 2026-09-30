import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * 29.09 доработки · 13 (SSR-SELF-FETCH-REMOVAL) — серверный код не ходит
 * HTTP-запросом к собственному API.
 *
 * Главная защита — удаление `lib/api/server-fetch.ts`: импорт `serverApiFetch`
 * больше не компилируется (правило 8 GUARD-INTEGRITY — тип сильнее сторожа).
 * Этот сторож — от САМОПИСНОГО хопа в серверном модуле (импортирует
 * `next/headers`, `server-only`, `@/lib/prisma` или `@/lib/env`). Хоп держал
 * входящий запрос, пока ждал исходящий к себе же, — два слота обработки на
 * один просмотр; тот же класс PERF-14 убрал из `proxy.ts`.
 *
 * Улики (в файле, где есть вызов `fetch` — или его алиаса: `const f = fetch`,
 * `x ?? fetch`):
 *   (а) чтение `headers()`/`cookies()` из `next/headers` — так выглядит
 *       пересылка сессии в запрос к себе;
 *   (б) литерал пути `/api/…` (строка, начинающаяся с него, или продолжение
 *       шаблона после `${…}`) или идентификатор `*APP_URL` / `APP_PUBLIC_URL`.
 * Строки вида `"GET /api/…"` (метки логов) уликой не считаются — путь не в
 * начале литерала.
 *
 * Исключения ПОСАЙТОВЫЕ: файл + точный набор улик. Новая улика в том же файле
 * краснеет, пропавшая — тоже (реестр не должен протухать).
 *
 * Слепая форма: URL собран в ДРУГОМ модуле и передан переменной, а файл с
 * вызовом не читает `next/headers` — ни одной улики в нём нет.
 *
 * @probe 2026-09-29 — (1) в `features/public-profile/master/sections/
 *        portfolio-section.tsx` вписан самописный хоп `const h = await headers();
 *        await fetch(\`http://${h.get("host")}/api/feed/portfolio?masterId=${id}\`)`
 *        (+ импорт `headers` из `next/headers`): красный «улик нет нигде, кроме
 *        названных мест» — `portfolio-section.tsx: /api/feed/portfolio, next/headers`.
 *        (2) по одной оси — тот же запрос без `headers()`, адрес из
 *        `env.NEXT_PUBLIC_APP_URL`: красный с уликами `/api/feed/portfolio`,
 *        `NEXT_PUBLIC_APP_URL` (признак (б)). (3) URL вынесен в другой модуль и
 *        передан переменной — зелёный: слепая форма, описана выше. Возвращено —
 *        зелёный.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const SERVER_IMPORT =
  /\bfrom\s*["'](?:next\/headers|server-only|@\/lib\/prisma|@\/lib\/env)["']|\bimport\s*["']server-only["']/;

/** Кому можно и почему — файл и ТОЧНЫЙ набор улик. */
const ALLOWED: Record<string, { evidence: string[]; why: string }> = {
  "src/lib/queue/healthcheck-ping.ts": {
    evidence: ["/api/health/worker", "APP_PUBLIC_URL", "NEXT_PUBLIC_APP_URL"],
    why: "пинг живости из процесса ВОРКЕРА — другой процесс, не SSR; адрес приложения берётся из env",
  },
};

/** Текст без содержимого обычных строк — чтобы «re-fetch (…)» в строке не читался вызовом. */
function blankPlainStrings(code: string): string {
  return code.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m[0] + " ".repeat(m.length - 2) + m[0]);
}

function selfFetchEvidence(source: string): string[] {
  const code = stripComments(source);
  if (!SERVER_IMPORT.test(code)) return [];
  const calls = blankPlainStrings(code);

  const names = new Set(["fetch"]);
  for (const m of calls.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*?(?<![\w.$])fetch(?![\w$])/g)) {
    names.add(m[1]);
  }
  const hasCall = [...names].some((name) =>
    new RegExp(`(?<![\\w.$])${name.replace(/\$/g, "\\$")}\\s*\\(`).test(calls),
  );
  if (!hasCall) return [];

  const evidence = new Set<string>();
  const readsRequest =
    /\bimport\s*\{[^}]*\b(?:headers|cookies)\b[^}]*\}\s*from\s*["']next\/headers["']/.test(code) &&
    /(?<![\w.$])(?:headers|cookies)\s*\(/.test(calls);
  if (readsRequest) evidence.add("next/headers");
  for (const m of code.matchAll(/(?:["'`]|\})(\/api\/[\w\-/]*)/g)) evidence.add(m[1].replace(/\/+$/, ""));
  for (const m of code.matchAll(/\b[A-Z_]*APP(?:_PUBLIC)?_URL\b/g)) evidence.add(m[0]);
  return [...evidence].sort();
}

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const scanned = listSources(SRC).map((file) => {
  const source = readFileSync(file, "utf8");
  return {
    rel: relative(ROOT, file).split(sep).join("/"),
    server: SERVER_IMPORT.test(stripComments(source)),
    evidence: selfFetchEvidence(source),
  };
});

describe("серверный код не ходит HTTP к собственному API", () => {
  it("улик нет нигде, кроме названных мест", () => {
    const offenders = scanned
      .filter((f) => f.evidence.length > 0 && !ALLOWED[f.rel])
      .map((f) => `${f.rel}: ${f.evidence.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("у названных мест улики ровно те, что записаны (реестр не протух)", () => {
    for (const [rel, entry] of Object.entries(ALLOWED)) {
      const found = scanned.find((f) => f.rel === rel);
      expect(found, rel).toBeDefined();
      expect(found?.evidence, rel).toEqual([...entry.evidence].sort());
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

  it("модуль петли удалён", () => {
    expect(scanned.some((f) => f.rel === "src/lib/api/server-fetch.ts")).toBe(false);
  });

  it("обход не вакуумный: серверных модулей сотни, с внешними вызовами — есть", () => {
    expect(scanned.filter((f) => f.server).length).toBeGreaterThan(200);
    const withCalls = scanned.filter((f) => {
      const code = blankPlainStrings(stripComments(readFileSync(join(ROOT, f.rel), "utf8")));
      return f.server && /(?<![\w.$])fetch\s*\(/.test(code);
    });
    expect(withCalls.length).toBeGreaterThanOrEqual(5);
  });
});

describe("машинерия детектора", () => {
  const SERVER = 'import { env } from "@/lib/env";\n';

  it("(а) пересылка сессии: headers() + fetch", () => {
    const src =
      'import { headers } from "next/headers";\n' +
      "export async function f(id: string) {\n" +
      "  const h = await headers();\n" +
      '  return fetch(`http://${h.get("host")}/api/feed/portfolio?masterId=${id}`);\n' +
      "}\n";
    expect(selfFetchEvidence(src)).toEqual(["/api/feed/portfolio", "next/headers"]);
  });

  it("(б) адрес приложения из env — без чтения headers()", () => {
    const src = SERVER + "export const f = () => fetch(`${env.NEXT_PUBLIC_APP_URL}/api/feed/portfolio`);\n";
    expect(selfFetchEvidence(src)).toEqual(["/api/feed/portfolio", "NEXT_PUBLIC_APP_URL"]);
  });

  it("алиас fetch — тоже вызов", () => {
    const src = SERVER + "const call = globalThis.x ?? fetch;\nexport const f = () => call(\"/api/reviews\");\n";
    expect(selfFetchEvidence(src)).toEqual(["/api/reviews"]);
  });

  it("внешний вызов и метка лога с путём — не улика", () => {
    const src =
      SERVER +
      "export async function f(t: string) {\n" +
      '  logError("GET /api/address/geocode failed", {});\n' +
      "  return fetch(`https://api.telegram.org/bot${t}/sendMessage`);\n" +
      "}\n";
    expect(selfFetchEvidence(src)).toEqual([]);
  });

  it("«re-fetch (…)» в строке — не вызов", () => {
    const src = SERVER + 'export const d = "worker API re-fetch (invariant #5)";\nexport const u = env.NEXT_PUBLIC_APP_URL;\n';
    expect(selfFetchEvidence(src)).toEqual([]);
  });

  it("клиентский модуль сторожу не интересен", () => {
    expect(selfFetchEvidence('"use client";\nexport const f = () => fetch("/api/reviews");\n')).toEqual([]);
  });
});
