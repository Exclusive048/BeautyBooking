/**
 * CSRF-CONTENT-TYPE-LAYER — где код читает ТЕЛО входящего запроса и защищено
 * ли это чтение проверкой типа содержимого (`lib/http/json-content-type.ts`).
 *
 * Сторож — `lib/http/request-body-readers.test.ts`; здесь только разбор, чтобы
 * его можно было проверить на фикстурах отдельно от дерева.
 *
 * ## Что считается запросом
 *
 * Свойство, а не имя переменной:
 *   - параметр с аннотацией `Request` / `NextRequest` (в любой функции — так
 *     ловятся и помощники вида `readBody(req: Request)`);
 *   - неаннотированный первый параметр обработчика роута: `export async
 *     function POST(req)`, `export const POST = async (req) => …` и функция
 *     внутри обёртки `export const POST = withX(async (req) => …)`;
 *   - переменная, проинициализированная таким значением или его `.clone()`.
 *
 * ## Что считается чтением тела
 *
 *   - вызов `.json() / .text() / .formData() / .arrayBuffer() / .blob() /
 *     .bytes()` у запроса или у `запрос.clone()`;
 *   - обращение к потоку `запрос.body`;
 *   - `readBodyTextCapped(запрос, …)` (SEC-16).
 *
 * `parseBody(запрос, …)` чтением НЕ считается: тип проверяет он сам
 * (`assertJsonContentType` первой строкой), а его собственное чтение внутри
 * `lib/validation` сканер видит и проверяет как любое другое.
 *
 * ## Что считается защитой
 *
 * В том же блоке, что содержит чтение (или во внешнем по отношению к нему), и
 * РАНЬШЕ чтения стоит одна из двух форм с тем же запросом в аргументе:
 *
 *     assertJsonContentType(req);                       // бросает 415
 *
 *     const nonJson = nonJsonBodyRefusal(req);          // 415-ответ или null
 *     if (nonJson) return nonJson;
 *
 * Требование «во внешнем блоке» — это «проверка выполняется на каждом пути к
 * чтению»: проверка внутри `if (…) { … }` перед чтением снаружи не засчитана.
 * У второй формы обязателен и `if (N) return N` между вызовом и чтением:
 * вызов, чей результат выброшен, ничего не защищает.
 *
 * ## Чего сканер не видит (границы названы, чтобы «зелено» читалось точно)
 *
 *   - запрос под параметром со структурным типом (`{ json(): Promise<…> }`) и
 *     неаннотированный параметр функции, не являющейся обработчиком роута;
 *   - деструктуризацию (`const { json } = req`) и доступ через `req["json"]`;
 *   - запрос, переданный в функцию другого пакета, которая читает тело сама.
 */

import ts from "typescript";
import { enclosingFunctionName, parseSource } from "@/lib/testing/prisma-calls";

const BODY_METHODS = new Set(["json", "text", "formData", "arrayBuffer", "blob", "bytes"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const REQUEST_TYPES = /^(Request|NextRequest)$/;

export type BodyReadKind = "method" | "stream" | "capped";

export type BodyReadSite = {
  file: string;
  line: number;
  /** Имя ближайшей именованной функции; `null` — чтение на верхнем уровне. */
  fn: string | null;
  kind: BodyReadKind;
  receiver: string;
  covered: boolean;
};

function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (
    ts.isParenthesizedExpression(cur) ||
    ts.isAsExpression(cur) ||
    ts.isNonNullExpression(cur) ||
    ts.isTypeAssertionExpression(cur) ||
    ts.isSatisfiesExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

/** `x` для `x` и для `x.clone()`; иначе `null`. */
function receiverName(expr: ts.Expression): string | null {
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isCallExpression(e)) {
    const callee = unwrap(e.expression);
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === "clone") {
      return receiverName(callee.expression);
    }
  }
  return null;
}

function exportedHttpMethodName(node: ts.Node): string | null {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const exported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  if (ts.isFunctionDeclaration(node) && exported && node.name && HTTP_METHODS.has(node.name.text)) {
    return node.name.text;
  }
  return null;
}

function collectRequestNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  const markFirstUntyped = (fn: ts.SignatureDeclarationBase) => {
    const first = fn.parameters[0];
    if (first && !first.type && ts.isIdentifier(first.name)) names.add(first.name.text);
  };

  const visit = (node: ts.Node) => {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type) {
      if (REQUEST_TYPES.test(node.type.getText(sf).trim())) names.add(node.name.text);
    }
    if (exportedHttpMethodName(node) && ts.isFunctionDeclaration(node)) {
      markFirstUntyped(node);
    }
    if (ts.isVariableStatement(node)) {
      const exported = ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (exported) {
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !HTTP_METHODS.has(decl.name.text) || !decl.initializer) continue;
          const walk = (n: ts.Node) => {
            if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) markFirstUntyped(n);
            ts.forEachChild(n, walk);
          };
          walk(decl.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Псевдонимы: `const r = req` / `const r = req.clone()` — до неподвижной точки.
  let grew = true;
  while (grew) {
    grew = false;
    const aliases = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const source = receiverName(node.initializer);
        if (source && names.has(source) && !names.has(node.name.text)) {
          names.add(node.name.text);
          grew = true;
        }
      }
      ts.forEachChild(node, aliases);
    };
    aliases(sf);
  }
  return names;
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

/** Блоки от чтения вверх до границы ближайшей функции. */
function enclosingBlocks(node: ts.Node): ts.Block[] {
  const blocks: ts.Block[] = [];
  let cur: ts.Node | undefined = node.parent;
  while (cur && !isFunctionLike(cur)) {
    if (ts.isBlock(cur)) blocks.push(cur);
    cur = cur.parent;
  }
  return blocks;
}

function callTo(expr: ts.Expression | undefined, name: string): ts.CallExpression | null {
  if (!expr) return null;
  const e = unwrap(expr);
  if (!ts.isCallExpression(e)) return null;
  const callee = unwrap(e.expression);
  return ts.isIdentifier(callee) && callee.text === name ? e : null;
}

function firstArgName(call: ts.CallExpression): string | null {
  const arg = call.arguments[0];
  return arg ? receiverName(arg) : null;
}

/** `if (N) return N;` / `if (N) { return N; }` */
function isReturnIfPresent(stmt: ts.Statement, name: string): boolean {
  if (!ts.isIfStatement(stmt) || stmt.elseStatement) return false;
  const cond = unwrap(stmt.expression);
  if (!ts.isIdentifier(cond) || cond.text !== name) return false;
  let then: ts.Statement = stmt.thenStatement;
  if (ts.isBlock(then)) {
    if (then.statements.length !== 1) return false;
    then = then.statements[0];
  }
  if (!ts.isReturnStatement(then) || !then.expression) return false;
  const ret = unwrap(then.expression);
  return ts.isIdentifier(ret) && ret.text === name;
}

function isCovered(read: ts.Node, receiver: string): boolean {
  const readStart = read.getStart();
  for (const block of enclosingBlocks(read)) {
    const stmts = block.statements;
    for (let i = 0; i < stmts.length; i += 1) {
      const stmt = stmts[i];
      if (stmt.getEnd() > readStart) break;

      if (ts.isExpressionStatement(stmt)) {
        const call = callTo(stmt.expression, "assertJsonContentType");
        if (call && firstArgName(call) === receiver) return true;
      }

      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          const call = callTo(decl.initializer, "nonJsonBodyRefusal");
          if (!call || firstArgName(call) !== receiver || !ts.isIdentifier(decl.name)) continue;
          const resultName = decl.name.text;
          for (let j = i + 1; j < stmts.length && stmts[j].getEnd() <= readStart; j += 1) {
            if (isReturnIfPresent(stmts[j], resultName)) return true;
          }
        }
      }
    }
  }
  return false;
}

export function scanRequestBodyReads(file: string, text: string): BodyReadSite[] {
  const sf = parseSource(file, text);
  const names = collectRequestNames(sf);
  if (names.size === 0) return [];
  const sites: BodyReadSite[] = [];

  const push = (node: ts.Node, kind: BodyReadKind, receiver: string) => {
    sites.push({
      file,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      fn: enclosingFunctionName(node),
      kind,
      receiver,
      covered: isCovered(node, receiver),
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isPropertyAccessExpression(callee) && BODY_METHODS.has(callee.name.text)) {
        const recv = receiverName(callee.expression);
        if (recv && names.has(recv)) push(node, "method", recv);
      }
      if (ts.isIdentifier(callee) && callee.text === "readBodyTextCapped") {
        const recv = firstArgName(node);
        if (recv && names.has(recv)) push(node, "capped", recv);
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "body") {
      const recv = receiverName(node.expression);
      if (recv && names.has(recv)) push(node, "stream", recv);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}
