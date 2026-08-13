import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FIX-B14 · SECURITY-EXPOSURE-AUDIT-01 · Y9 — ни один ответ auth-границы не
 * несёт `AppError.details`.
 *
 * Y9 снял `details` с трёх колбэков и завёл под это `failOAuthCallback`. Но его
 * намерение было СВОЙСТВОМ ГРАНИЦЫ, а зафиксировано было тремя файлами —
 * и `oauth-callback-error.test.ts` сторожит ровно хелпер, не границу. Поэтому
 * `details` спокойно жил ещё на одиннадцати сайтах рядом: обе стартовые ноги
 * OAuth, четыре unlink'а, три интеграционных VK-роута, telegram-настройки и
 * админский переключатель килсвитча. Ни один тест не краснел — некому было.
 *
 * 🔴 Поэтому здесь проверяется ПОЛНОТА, а не членство (QUALITY-GATES,
 * GUARD-INTEGRITY правило 2): список поверхностей не перечисляется руками, а
 * ВЫВОДИТСЯ из дерева роутов двумя признаками —
 *
 *   1. семейство пути: `api/auth/**`, `api/integrations/**`, `api/telegram/**`;
 *   2. потребление провайдерского модуля: импорт `@/lib/{vk,yandex,telegram}/*`.
 *
 * Второй признак не декоративный: именно он нашёл `api/admin/system-config`
 * (переключает килсвитч FZ-199, живёт вне трёх семейств) и именно он подхватит
 * будущий `api/integrations/yandex/*` в день его появления. Признак «импортирует
 * `@/lib/auth/*`» намеренно НЕ используется — сессию читает почти каждый роут
 * приложения, и граница перестала бы что-либо ограничивать.
 *
 * Исключений нет. Появится законная нужда отдать `details` с auth-поверхности —
 * это правка Y9, а не запись в реестр.
 *
 * @probe   что сломать: вернуть `appError.details` четвёртым аргументом в
 *          `src/app/api/auth/vk/unlink/route.ts:36`.
 *          наблюдалось: «auth-поверхности, отдающие AppError.details наружу:
 *          src/app/api/auth/vk/unlink/route.ts:38 → jsonFail(…, appError.details)»
 *          — падает первое утверждение, и оно называет сайт.
 */

const API_ROOT = join(process.cwd(), "src", "app", "api");

const AUTH_PATH_FAMILIES = [
  "src/app/api/auth/",
  "src/app/api/integrations/",
  "src/app/api/telegram/",
];

const PROVIDER_MODULE_IMPORT = /@\/lib\/(?:vk|yandex|telegram)\//;

/** `details` уезжает наружу только четвёртым аргументом конвертов проекта. */
const DETAILS_FORWARD = /\b(?:json)?[Ff]ail\([^;]*?\b\w+\.details\b/;

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listRouteFiles(full));
      continue;
    }
    if (entry === "route.ts" || entry === "route.tsx") out.push(full);
  }
  return out;
}

/** Комментарии вырезаются: в них `appError.details` упоминается по делу. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n]*?\/\/.*$/gm, "");
}

function toRel(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

const routeFiles = listRouteFiles(API_ROOT).map((file) => ({
  rel: toRel(file),
  source: readFileSync(file, "utf8"),
}));

const authSurfaces = routeFiles.filter(
  ({ rel, source }) =>
    AUTH_PATH_FAMILIES.some((family) => rel.startsWith(family)) ||
    PROVIDER_MODULE_IMPORT.test(source),
);

describe("FIX-B14 — auth-граница не отдаёт AppError.details", () => {
  it("набор поверхностей выведен из дерева и непуст (иначе проверка вакуумна)", () => {
    // Не-вакуумность: если обход дерева сломается, `authSurfaces` станет
    // пустым и главное утверждение будет проходить всегда. Пороги — грубые
    // якоря на порядок величины, не инвентарь.
    expect(routeFiles.length).toBeGreaterThan(200);
    expect(authSurfaces.length).toBeGreaterThanOrEqual(20);
    const rels = authSurfaces.map((s) => s.rel);
    expect(rels).toContain("src/app/api/auth/vk/start/route.ts");
    expect(rels).toContain("src/app/api/auth/yandex/start/route.ts");
    // Признак 2 в действии — файл вне трёх семейств пути.
    expect(rels).toContain("src/app/api/admin/system-config/route.ts");
  });

  it("ни одна auth-поверхность не форвардит details клиенту", () => {
    const offenders: string[] = [];
    for (const { rel, source } of authSurfaces) {
      const cleaned = stripComments(source);
      cleaned.split("\n").forEach((line, index) => {
        if (DETAILS_FORWARD.test(line)) offenders.push(`${rel}:${index + 1} → ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `auth-поверхности, отдающие AppError.details наружу:\n${offenders.join("\n")}\n\n` +
        "Диагностика уезжает в лог со скрабом (см. oauth-callback-error.ts / " +
        "oauth-start-error.ts), а не в тело ответа.",
    ).toEqual([]);
  });
});
