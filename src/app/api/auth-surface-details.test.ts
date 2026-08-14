import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { stripComments } from "@/lib/testing/source-scan";

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

/**
 * `details` уезжает наружу только четвёртым аргументом конвертов проекта.
 *
 * 🔴 **ДЕМОТИРОВАН FIX-C6 — читать вместе с тем, что теперь несёт тип.**
 *
 * Девять поверхностей, которые ЛОВЯТ ошибку и отвечают на неё (четыре
 * `unlink`, telegram-`link`, telegram-настройки, два интеграционных VK-роута,
 * админский переключатель килсвитча, email-OTP-verify), больше не держат в
 * руках объект с диагностикой: они зовут `toAuthSurfaceError`
 * (`lib/auth/auth-surface-error.ts`), а у `AuthSurfaceError` поля `details`
 * НЕТ. Прокинуть его там нельзя ни прямо, ни через промежуточную переменную,
 * ни спредом — то есть ровно те формы, что FIX-C5 записал как невидимые,
 * теперь ошибки компиляции (проба — `auth-surface-error.test.ts`).
 *
 * ⚠️ **Что детектор добавляет сверх типа — и почему его нельзя удалить.**
 * Три OAuth-колбэка держат `AppError` по ДРУГОЙ причине: они его бросают
 * (`throw new AppError(...)`), и сузить их вид нечем — объект приходит из
 * `catch` как `unknown` и приводится `instanceof`-ом. За ними, а также за
 * любой будущей auth-поверхностью, которая заведёт себе `AppError` сама,
 * остаётся эта проверка. Она по-прежнему построчная и по-прежнему обходится
 * сборкой аргумента заранее — записано, чтобы «зелено» здесь читалось как
 * «известных форм нет», а не «утечек нет».
 *
 * Второе, что детектор держит и после конверсии: **никто не вернул `toAppError`
 * на конвертированные девять**. Тип защищает того, кто взял правильный вид;
 * вернувшийся `toAppError` вернул бы и `details`.
 */
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

/**
 * Комментарии вырезаются: в них `appError.details` упоминается по делу.
 *
 * FIX-C5: разбор переведён на общий `lib/testing/source-scan.ts`. Прежняя форма
 * (`^[^\n]*?//.*$`) сносила СТРОКУ ЦЕЛИКОМ, если та заканчивалась
 * комментарием, — то есть `return jsonFail(400, e.message, code, e.details); //
 * причина` исчезал вместе с нарушением, и сторож объявлял «утечек нет».
 * Ложный ЗЕЛЁНЫЙ на security-инварианте.
 */

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
