import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { $Enums } from "@prisma/client";
import { MARKETING_NOTIFICATION_TYPES, NOTIFICATION_TYPE_PURPOSE } from "./marketing-types";
import { enclosingFunctionName, findInitializer, parseSource } from "@/lib/testing/prisma-calls";

/**
 * 29.09 доработки · 16 — у каждого типа уведомления явное назначение, и
 * рекламный тип не создаётся мимо проверки согласия.
 *
 * (1) Полнота — `Record<NotificationType, …>` в `marketing-types.ts`: новый тип
 *     в `enums.prisma` без классификации не собирается; здесь — обратная
 *     сторона (лишних ключей нет) и согласие реестра рекламных с назначением.
 * (2) Единственный писатель строки уведомления — `createNotification`
 *     (`notifications/service.ts`); проверка согласия стоит в
 *     `deliverNotification`. Вызов `createNotification` с рекламным типом вне
 *     `delivery.ts` обходил бы её — сторож разбирает AST: литерал
 *     `NotificationType.X` / `"X"`, в том числе через переменную из той же
 *     функции, и импорт под другим именем.
 *
 * Слепая форма: тип приходит параметром функции (`createNotification({ type })`
 * внутри обёртки с параметром `type`) — значение в месте вызова неизвестно; все
 * такие обёртки в `src/` перечислены ниже поимённо, новая — красный тест.
 *
 * @probe 2026-09-29 — в `hot-slots/notifications.ts` добавлен обход:
 *        `const t = NotificationType.HOT_SLOT_AVAILABLE; await createNotification({ userId, type: t, … })`
 *        — красный «рекламный тип передан в createNotification мимо
 *        deliverNotification» с этим сайтом. Возвращено — зелёный.
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Места, где `type` приходит параметром (разобрать нельзя) — посайтово: файл#функция. */
const PARAM_TYPE_CALLERS: Record<string, string> = {
  "src/lib/notifications/delivery.ts#deliverNotification": "сам чокпоинт: проверка согласия стоит перед вызовом",
  "src/lib/notifications/service.ts#createNotifications":
    "внутренний пакетный помощник (не экспортирован): его зовут функции записей о бронях этого же файла с сервисными типами",
};

type CallSite = { file: string; line: number; type: string | null; site: string };

function typeValue(expr: ts.Expression, depth = 0): string | null {
  if (depth > 6) return null;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isStringLiteralLike(expr)) return expr.text;
  if (ts.isAsExpression(expr) || ts.isParenthesizedExpression(expr)) return typeValue(expr.expression, depth + 1);
  if (ts.isIdentifier(expr)) {
    const init = findInitializer(expr);
    return init ? typeValue(init, depth + 1) : null;
  }
  return null;
}

function createNotificationCalls(file: string, text: string): CallSite[] {
  const sf = parseSource(file, text);
  const names = new Set<string>();
  sf.statements.forEach((st) => {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings) return;
    const bindings = st.importClause.namedBindings;
    if (!ts.isNamedImports(bindings)) return;
    for (const el of bindings.elements) {
      if ((el.propertyName ?? el.name).text === "createNotification") names.add(el.name.text);
    }
  });
  if (file === "src/lib/notifications/service.ts") names.add("createNotification");
  if (names.size === 0) return [];
  const out: CallSite[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
      const arg = node.arguments[0];
      let type: string | null = null;
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const p of arg.properties) {
          if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "type") type = typeValue(p.initializer);
          if (ts.isShorthandPropertyAssignment(p) && p.name.text === "type") type = typeValue(p.name);
        }
      }
      out.push({
        file,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        type,
        site: `${file}#${enclosingFunctionName(node) ?? "?"}`,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const calls = walk(join(ROOT, "src"))
  .map((full) => ({ rel: relative(ROOT, full).split(sep).join("/"), text: readFileSync(full, "utf8") }))
  .filter((f) => f.text.includes("createNotification"))
  .flatMap((f) => createNotificationCalls(f.rel, f.text));

describe("назначение типов уведомлений", () => {
  it("классификация покрывает ровно enum NotificationType", () => {
    expect(Object.keys(NOTIFICATION_TYPE_PURPOSE).sort()).toEqual(Object.values($Enums.NotificationType).sort());
  });

  it("реестр рекламных совпадает с назначением «marketing», у каждого — причина", () => {
    const marketing = Object.entries(NOTIFICATION_TYPE_PURPOSE)
      .filter(([, purpose]) => purpose === "marketing")
      .map(([type]) => type)
      .sort();
    expect(Object.keys(MARKETING_NOTIFICATION_TYPES).sort()).toEqual(marketing);
    for (const reason of Object.values(MARKETING_NOTIFICATION_TYPES)) expect(reason.length).toBeGreaterThan(40);
  });

  it("решение Ю1 (вариант В): скидочное — рекламное, «окошко освободилось» — сервисное", () => {
    expect(NOTIFICATION_TYPE_PURPOSE.HOT_SLOT_AVAILABLE).toBe("marketing");
    expect(NOTIFICATION_TYPE_PURPOSE.SLOT_FREED).toBe("service");
  });
});

describe("рекламный тип — только через deliverNotification", () => {
  it("обход находит вызовы createNotification (иначе сторож вакуумен)", () => {
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("рекламный тип не передаётся в createNotification мимо deliverNotification", () => {
    const offenders = calls
      .filter((c) => c.type !== null && c.type in MARKETING_NOTIFICATION_TYPES && c.file !== "src/lib/notifications/delivery.ts")
      .map((c) => `${c.file}:${c.line} (${c.type})`);
    expect(offenders, `рекламный тип передан в createNotification мимо deliverNotification: ${offenders.join(", ")}`).toEqual([]);
  });

  it("тип-параметр — только в названных обёртках", () => {
    const unknown = calls
      .filter((c) => c.type === null && !(c.site in PARAM_TYPE_CALLERS))
      .map((c) => `${c.file}:${c.line}`);
    expect(unknown, `тип в createNotification не разрешается до литерала: ${unknown.join(", ")}`).toEqual([]);
  });
});
