import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSensitiveRouteKey } from "@/lib/rate-limit";
import FROZEN from "@/lib/rate-limit/fail-open-mutating-routes.json";

/**
 * GUARD-INTEGRITY — вторая половина сторожа инв. #6 (fail-closed).
 *
 * Соседний `sensitive-routes.test.ts` проверяет ЧЛЕНСТВО: перечисляет знакомые
 * пути и требует нужный ответ. Это настоящая проверка, но не полнота — новый
 * денежный роут под другим префиксом проходит зелёным, потому что его в списке
 * просто нет. Ровно тот класс «список молча протух», от которого в проекте уже
 * заведены DMMF-guard'ы (инв. #35/#38) и обратный guard CRM (инв. #25).
 *
 * 🔴 Полноту здесь **вывести нельзя**: «этот роут обязан быть fail-closed» —
 * продуктовое суждение, а мутирующих роутов вне чувствительных префиксов 108.
 * Классифицировать их поимённо — отдельная работа (`RATE-LIMIT-ROUTE-TRIAGE`
 * в BACKLOG). Поэтому сторож делает то, что сделать МОЖНО и что закрывает
 * реальный риск: **замораживает инвентарь**. Любой НОВЫЙ мутирующий роут вне
 * префиксов обязан быть осознанно внесён в снимок — то есть автор увидит
 * вопрос «а это точно не денежный путь?» в момент появления роута, а не на
 * инциденте.
 *
 * @probe   что сломать: завести `src/app/api/refunds/request/route.ts` с `export async function POST`
 *          наблюдалось: «Новый мутирующий роут вне чувствительных префиксов …
 *          Появились: /api/refunds/request»; после удаления роута — зелёный.
 *
 * Почему снимок, а не реестр с причинами: реестр на 108 строк никто не напишет
 * честно, и он выродится в «ок» напротив каждой. Снимок стоит одну строку и
 * ловит именно дельту.
 */

const API_ROOT = path.resolve(process.cwd(), "src", "app", "api");
const MUTATING = /export\s+(?:async\s+)?function\s+(POST|PATCH|PUT|DELETE)\b/;

function collectMutatingRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectMutatingRoutes(full, acc);
      continue;
    }
    if (entry !== "route.ts") continue;
    if (!MUTATING.test(readFileSync(full, "utf8"))) continue;
    const rel = path
      .relative(path.resolve(process.cwd(), "src", "app"), dir)
      .split(path.sep)
      .join("/");
    acc.push("/" + rel.replace(/\/\([^)]*\)/g, ""));
  }
  return acc;
}

const proxyKey = (method: string, template: string) => `rl:api:1.2.3.4:${method}:${template}`;

describe("инв. #6 · полнота fail-closed, а не членство", () => {
  const all = collectMutatingRoutes(API_ROOT);
  const failOpen = all.filter((route) => !isSensitiveRouteKey(proxyKey("POST", route)));

  it("обход что-то находит — иначе сторож вакуумен", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it("ни один НОВЫЙ мутирующий роут не проваливается в fail-open молча", () => {
    const frozen = new Set(FROZEN as string[]);
    const appeared = failOpen.filter((route) => !frozen.has(route)).sort();

    expect(
      appeared,
      "Новый мутирующий роут вне чувствительных префиксов. Решите ОСОЗНАННО: " +
        "если он пишет деньги / auth / ПДн — добавьте префикс в SENSITIVE_ROUTE_PREFIXES " +
        "(`src/lib/rate-limit/index.ts`); если нет — внесите путь в " +
        "`fail-open-mutating-routes.json`. Молча оставлять нельзя: при недоступности " +
        "Redis такой роут деградирует до per-process memory-fallback в проде и до " +
        "полного fail-open в dev (инв. #6). Появились: " + appeared.join(", "),
    ).toEqual([]);
  });

  it("снимок не протух: исчезнувшие роуты убираются из него", () => {
    const live = new Set(failOpen);
    const stale = (FROZEN as string[]).filter((route) => !live.has(route)).sort();
    expect(
      stale,
      "Роуты из снимка больше не существуют (или стали чувствительными) — уберите их, " +
        "иначе снимок начнёт покрывать пути, которых нет: " + stale.join(", "),
    ).toEqual([]);
  });

  it("изъятия из fail-closed остаются точечными, а не префиксными", () => {
    // LOGIC-14: два прогона по расписанию изъяты намеренно; изъятие ОБЯЗАНО
    // быть точечным — префиксное вернуло бы весь `/api/billing` в fail-open.
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/billing/renew/run"))).toBe(false);
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/billing/checkout"))).toBe(true);
  });
});
