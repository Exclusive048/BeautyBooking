import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import INVENTORY from "@/lib/http/client-fetch-inventory.json";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * 29.09 доработки · 11 (CLIENT-ERROR-MESSAGE-PASSTHROUGH-SWEEP) — замороженный
 * инвентарь клиентских запросов мимо общего разбора ответа.
 *
 * Курируемая строка сервера (`AppError.message`) гибнет на клиенте двумя путями:
 * сырой `fetch(`/`fetchWithAuth(`, после которого читается только `res.ok`, и
 * ручной разбор конверта (`json.error?.message ?? …`) — второй разбор рядом с
 * `readApiResponse`, без признака `fromServer`. `check:error-message-lang`
 * сторожит СЕРВЕРНЫЕ конверты и этого не видит по построению.
 *
 * Полноту вывести нельзя (сырой запрос бывает законным: фон, SSE, загрузка
 * файла), поэтому — правило 2 GUARD-INTEGRITY: **инвентарь заморожен по файлу и
 * числу, падаем на дельте в обе стороны** (базлайн не должен молча расходиться
 * с кодом). У каждой записи — решение: `pending` (ещё не разобрано), `own`
 * (действия у пользователя нет — строка поверхности), `silent` (фон без
 * участия пользователя). Действенные отказы из инвентаря уходят совсем: сайт
 * переводится на `fetchJson`/`fetchJsonWithAuth` + `serverMessageOr` и файл
 * вносится в `ACTIONABLE_REFUSAL_SURFACES` (`actionable-refusal-passthrough.test.ts`).
 *
 * Клиентский файл — `"use client"` ИЛИ сырой запрос к относительному `/api/…`
 * (так ловятся модули без директивы: `studio-booking.ts`, `push-client.ts`).
 * Чокпоинты (`lib/http/client.ts`, `lib/http/fetch-with-auth.ts`) не считаются.
 *
 * Слепые формы: замена одного сырого вызова другим в том же файле при
 * неизменном числе; разбор конверта под другим именем поля (`body.err.message`);
 * запрос через собственную обёртку, названную не `fetch`.
 *
 * Обновить базлайн после осознанной правки: `UPDATE_CLIENT_FETCH_INVENTORY=1
 * npx vitest run src/lib/http/client-fetch-inventory.test.ts` — решения и
 * причины существующих записей сохраняются, новые получают `pending`.
 *
 * @probe 2026-09-29 — в уже переведённом `portfolio/modals/upload-modal.tsx`
 *        (носитель действенного отказа, `fetchJson` + `serverMessageOr`)
 *        дописан рядом `const res = await fetch(url); if (!res.ok) throw new
 *        Error(T.x);` → «клиентский запрос мимо fetchJson/readApiResponse не
 *        заморожен: …upload-modal.tsx (fetch 1, разбор 0)» — ровно та файловая
 *        амнистия, которую давал прежний детектор BACKLOG («читает fetchJson —
 *        значит чистый»). Вторая ось — тот же вызов через `fetchWithAuth(` —
 *        красный так же. Восстановлено побайтно — зелёный.
 */

type Decision = "pending" | "own" | "silent";
type Entry = { rawFetch: number; manualParse: number; decision: Decision; reason?: string };

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const INVENTORY_PATH = join(ROOT, "src/lib/http/client-fetch-inventory.json");
const CHOKEPOINTS = new Set(["src/lib/http/client.ts", "src/lib/http/fetch-with-auth.ts"]);

const RAW_FETCH = /(?<![\w$.])fetch(?:WithAuth)?\s*\(/g;
const MANUAL_PARSE = /\.error\??\.message\b/g;
const RELATIVE_API_FETCH = /(?<![\w$.])fetch(?:WithAuth)?\s*\(\s*[`"']\/api\//;
const USE_CLIENT = /^\s*["']use client["']/;

export function scanSource(source: string): { isClient: boolean; rawFetch: number; manualParse: number } {
  const code = stripComments(source);
  return {
    isClient: USE_CLIENT.test(source) || RELATIVE_API_FETCH.test(code),
    rawFetch: code.match(RAW_FETCH)?.length ?? 0,
    manualParse: code.match(MANUAL_PARSE)?.length ?? 0,
  };
}

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function scanTree(): Map<string, { rawFetch: number; manualParse: number }> {
  const found = new Map<string, { rawFetch: number; manualParse: number }>();
  for (const file of listSources(SRC)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (CHOKEPOINTS.has(rel)) continue;
    const scan = scanSource(readFileSync(file, "utf8"));
    if (!scan.isClient || scan.rawFetch + scan.manualParse === 0) continue;
    found.set(rel, { rawFetch: scan.rawFetch, manualParse: scan.manualParse });
  }
  return found;
}

const inventory = INVENTORY as Record<string, Entry>;

describe("29.09 · 11 — клиентские запросы мимо общего разбора заморожены", () => {
  const found = scanTree();

  if (process.env.UPDATE_CLIENT_FETCH_INVENTORY === "1") {
    const next: Record<string, Entry> = {};
    for (const [file, counts] of [...found.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const prev = inventory[file];
      next[file] = {
        ...counts,
        decision: prev?.decision ?? "pending",
        ...(prev?.reason ? { reason: prev.reason } : {}),
      };
    }
    writeFileSync(INVENTORY_PATH, `${JSON.stringify(next, null, 2)}\n`);
  }

  it("контроль машинерии: сырой вызов виден и с хвостовым комментарием, fetchJson( и prefetch( — нет", () => {
    const broken = scanSource(
      '"use client";\nconst res = await fetch(url); // свой текст\nconst r2 = await fetchWithAuth("/api/x");\n' +
        "setError(json.error?.message ?? T.x);\n",
    );
    expect(broken).toEqual({ isClient: true, rawFetch: 2, manualParse: 1 });

    const fixed = scanSource(
      '"use client";\nawait fetchJson(url);\nawait fetchJsonWithAuth("/api/x");\nrouter.prefetch(href);\n' +
        "// fetch(url) в комментарии\nserverMessageOr(e, T.x);\n",
    );
    expect(fixed).toEqual({ isClient: true, rawFetch: 0, manualParse: 0 });

    // модуль без директивы, но с запросом к относительному /api/ — клиентский
    expect(scanSource('export const x = () => fetch("/api/y");').isClient).toBe(true);
    // серверный модуль с абсолютным адресом — нет
    expect(scanSource("export const x = () => fetch(url);").isClient).toBe(false);
  });

  it("новых файлов нет, числа совпадают с базлайном, исчезнувшие удалены", () => {
    const unexpected: string[] = [];
    const drifted: string[] = [];
    for (const [file, counts] of found) {
      const frozen = inventory[file];
      if (!frozen) {
        unexpected.push(`${file} (fetch ${counts.rawFetch}, разбор ${counts.manualParse})`);
        continue;
      }
      if (frozen.rawFetch !== counts.rawFetch || frozen.manualParse !== counts.manualParse) {
        drifted.push(
          `${file}: заморожено fetch ${frozen.rawFetch} / разбор ${frozen.manualParse}, ` +
            `найдено ${counts.rawFetch} / ${counts.manualParse}`,
        );
      }
    }
    const vanished = Object.keys(inventory).filter((file) => !found.has(file));

    expect(
      unexpected,
      `клиентский запрос мимо fetchJson/readApiResponse не заморожен:\n${unexpected.join("\n")}\n\n` +
        "Курируемая строка сервера здесь гибнет. Перевести на fetchJson/fetchJsonWithAuth + " +
        "serverMessageOr либо внести в client-fetch-inventory.json с решением own/silent и причиной.",
    ).toEqual([]);
    expect(drifted, `число сырых запросов/разборов в файле изменилось:\n${drifted.join("\n")}`).toEqual([]);
    expect(vanished, `запросы исчезли — удалите строки из базлайна:\n${vanished.join("\n")}`).toEqual([]);
  });

  it("у каждого решения own/silent есть причина", () => {
    const missing = Object.entries(inventory)
      .filter(([, entry]) => entry.decision !== "pending" && !entry.reason)
      .map(([file]) => file);
    expect(missing).toEqual([]);
  });

  it("неразобранных нет: каждый оставшийся сырой запрос — осознанное own/silent", () => {
    // Разбор 29.09 · 11 закрыт (152 файла → 5). Новый сырой запрос обязан прийти
    // с решением и причиной, а не «потом разберём».
    const pending = Object.entries(inventory)
      .filter(([, entry]) => entry.decision === "pending")
      .map(([file]) => file);
    expect(pending, `сырые запросы без решения:\n${pending.join("\n")}`).toEqual([]);
  });

  it("ручных разборов конверта в клиентском коде нет — только readApiResponse", () => {
    const manual = Object.entries(inventory)
      .filter(([, entry]) => entry.manualParse > 0)
      .map(([file]) => file);
    expect(manual, `\`.error.message\` разбирается руками:\n${manual.join("\n")}`).toEqual([]);
  });
});
