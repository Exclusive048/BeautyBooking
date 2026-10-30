/**
 * CSRF-CONTENT-TYPE-LAYER — сторож полноты третьего слоя CSRF.
 *
 * Утверждение: тело входящего запроса читается только (а) через `parseBody`,
 * (б) после `nonJsonBodyRefusal(req)` + `if (…) return …` либо
 * `assertJsonContentType(req)` в объемлющем блоке, (в) в месте из реестра
 * `REQUEST_BODY_READERS` — посайтово, с числом чтений в функции. Набор чтений
 * ВЫВОДИТСЯ из дерева `src/` по свойству (запрос — по типу параметра и по
 * роли обработчика роута, не по имени переменной; разбор и его границы —
 * `lib/testing/request-body-reads.ts`), реестр сверяется в обе стороны.
 *
 * @probe 2026-10-30 — выполнены на дереве, каждая краснела с указанным текстом:
 *   1. Из `billing/checkout/route.ts` убраны обе строки проверки → «новые
 *      непроверенные чтения тела … "src/app/api/billing/checkout/route.ts#POST: 1"».
 *   2. Там же оставлен вызов, но удалён `if (nonJson) return nonJson;` (результат
 *      выброшен) → то же сообщение: вызов без возврата не засчитан.
 *   3. Проверка перенесена внутрь `if (user.roles.length) { … }` перед чтением
 *      снаружи → то же: проверка не на каждом пути к чтению.
 *   4. Импорт и вызов переименованы (`nonJsonBodyRefusal as refuse`,
 *      `refuse(req)`) → то же: сторож краснеет, а не пропускает (ошибка в
 *      безопасную сторону).
 *   5. Новый роут `src/app/api/zz-probe/route.ts`:
 *      `export const POST = async (request) => request.formData();`
 *      (неаннотированный параметр, не `req`) → «"src/app/api/zz-probe/route.ts#POST: 1"».
 *   6. Запись `profiles/master` закомментирована → «новые непроверенные чтения
 *      … profiles/master/route.ts#POST: 1»; добавлена запись
 *      `me/route.ts#GET` → «записи реестра без чтений — удалите их».
 *   7. В реестре `body-limit.ts#readBodyTextCapped` `reads: 2` → `reads: 1`
 *      (перепроба 2026-10-30 — прежний пример `auth/roles/add` снят вместе с
 *      веткой формы) → «число чтений расходится»: лишнее чтение в той же
 *      функции не проходит молча.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUEST_BODY_READERS } from "@/lib/http/request-body-readers";
import { scanRequestBodyReads } from "@/lib/testing/request-body-reads";

const REPO = path.resolve(__dirname, "../../..");
const SRC = path.join(REPO, "src");

function walk(dir: string, out: string[]): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function rel(file: string): string {
  return path.relative(REPO, file).replace(/\\/g, "/");
}

describe("scanRequestBodyReads — разбор (фикстуры)", () => {
  const scan = (text: string, file = "src/app/api/x/route.ts") => scanRequestBodyReads(file, text);
  const open = (text: string, file?: string) => scan(text, file).filter((s) => !s.covered);

  it("чтение без проверки — открыто", () => {
    expect(open(`export async function POST(req: Request) { const b = await req.json(); return b; }`)).toHaveLength(1);
  });

  it("nonJsonBodyRefusal + if-return перед чтением — закрыто", () => {
    const sites = scan(`
      export async function POST(req: Request) {
        const nonJson = nonJsonBodyRefusal(req);
        if (nonJson) return nonJson;
        return await req.json();
      }`);
    expect(sites).toHaveLength(1);
    expect(sites[0].covered).toBe(true);
  });

  it("if-return блоком тоже засчитан", () => {
    expect(
      open(`
      export async function POST(req: Request) {
        const r = nonJsonBodyRefusal(req);
        if (r) { return r; }
        return await req.json();
      }`),
    ).toHaveLength(0);
  });

  it("результат выброшен — открыто", () => {
    expect(
      open(`
      export async function POST(req: Request) {
        nonJsonBodyRefusal(req);
        return await req.json();
      }`),
    ).toHaveLength(1);
    expect(
      open(`
      export async function POST(req: Request) {
        const nonJson = nonJsonBodyRefusal(req);
        return await req.json();
      }`),
    ).toHaveLength(1);
  });

  it("проверка во вложенном if — открыто (не на каждом пути)", () => {
    expect(
      open(`
      export async function POST(req: Request) {
        if (Math.random() > 0.5) {
          const nonJson = nonJsonBodyRefusal(req);
          if (nonJson) return nonJson;
        }
        return await req.json();
      }`),
    ).toHaveLength(1);
  });

  it("проверка после чтения — открыто", () => {
    expect(
      open(`
      export async function POST(req: Request) {
        const body = await req.json();
        const nonJson = nonJsonBodyRefusal(req);
        if (nonJson) return nonJson;
        return body;
      }`),
    ).toHaveLength(1);
  });

  it("проверка другого запроса — открыто", () => {
    expect(
      open(`
      export async function POST(req: Request, other: Request) {
        const nonJson = nonJsonBodyRefusal(other);
        if (nonJson) return nonJson;
        return await req.json();
      }`),
    ).toHaveLength(1);
  });

  it("assertJsonContentType перед чтением, в том числе внутри try — закрыто", () => {
    expect(
      open(`
      export async function POST(req: Request) {
        assertJsonContentType(req);
        try { return await req.text(); } catch { return null; }
      }`),
    ).toHaveLength(0);
  });

  it("запрос узнаётся по свойству, а не по имени", () => {
    const forms = [
      `export const POST = async (request) => request.formData();`,
      `export const PATCH = withAuth(async (r) => r.json());`,
      `export async function DELETE(input) { return input.arrayBuffer(); }`,
      `async function helper(x: NextRequest) { return x.blob(); }`,
      `export async function POST(req: Request) { const r = req; return r.json(); }`,
      `export async function POST(req: Request) { return req.clone().text(); }`,
      `export async function POST(req: Request) { return req.body?.getReader(); }`,
      `export async function POST(req: Request) { return readBodyTextCapped(req); }`,
    ];
    for (const text of forms) {
      expect(open(text), text).toHaveLength(1);
    }
  });

  it("parseBody — не чтение (тип проверяет сам), Response — не запрос", () => {
    expect(scan(`export async function POST(req: Request) { return parseBody(req, schema); }`)).toHaveLength(0);
    expect(scan(`async function f(res: Response) { return res.json(); }`)).toHaveLength(0);
  });

  it("неаннотированный параметр НЕ обработчика роута не считается запросом (названная граница)", () => {
    expect(scan(`async function helper(req) { return req.json(); }`)).toHaveLength(0);
  });
});

describe("REQUEST_BODY_READERS — полнота по дереву", () => {
  const sites = walk(SRC, []).flatMap((file) => scanRequestBodyReads(rel(file), fs.readFileSync(file, "utf8")));
  const openByKey = new Map<string, number>();
  for (const site of sites) {
    if (site.covered) continue;
    const key = `${site.file}#${site.fn ?? "<верхний уровень>"}`;
    openByKey.set(key, (openByKey.get(key) ?? 0) + 1);
  }
  const registry = new Map(REQUEST_BODY_READERS.map((entry) => [`${entry.file}#${entry.fn}`, entry]));

  it("разбор дерева не пуст (сторож не вакуумен)", () => {
    expect(sites.filter((s) => s.covered).length).toBeGreaterThan(20);
    expect(sites.some((s) => s.file === "src/lib/validation/index.ts" && s.covered)).toBe(true);
  });

  it("записи реестра уникальны, с причиной, файлы существуют", () => {
    expect(registry.size).toBe(REQUEST_BODY_READERS.length);
    for (const entry of REQUEST_BODY_READERS) {
      expect(entry.reason.trim().length, entry.file).toBeGreaterThan(10);
      expect(entry.reads, entry.file).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(REPO, entry.file)), entry.file).toBe(true);
    }
  });

  it("нет новых непроверенных чтений тела", () => {
    const unregistered = [...openByKey].filter(([key]) => !registry.has(key)).map(([key, n]) => `${key}: ${n}`);
    expect(
      unregistered,
      "новые непроверенные чтения тела — добавьте nonJsonBodyRefusal(req) перед чтением " +
        "(lib/api/json-body-refusal.ts) либо обоснованную запись в REQUEST_BODY_READERS",
    ).toEqual([]);
  });

  it("нет записей реестра без чтений", () => {
    const stale = [...registry.keys()].filter((key) => !openByKey.has(key));
    expect(stale, "записи реестра без чтений — удалите их").toEqual([]);
  });

  it("число чтений совпадает с реестром", () => {
    const mismatched = [...openByKey]
      .filter(([key, n]) => registry.has(key) && registry.get(key)!.reads !== n)
      .map(([key, n]) => `${key}: в дереве ${n}, в реестре ${registry.get(key)!.reads}`);
    expect(mismatched, "число чтений расходится").toEqual([]);
  });
});
