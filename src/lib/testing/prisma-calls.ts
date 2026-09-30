import ts from "typescript";

/**
 * 29.09 доработки · 14 — общий AST-разборщик вызовов делегата Prisma для
 * сторожей (статус брони пишет только `transition.ts`; скоуп конфликта — по
 * месту). Прежние сторожа искали регекспом по тексту и потому были слепы к
 * формам, которые пишет любой автор: `updateMany`, аргумент, собранный заранее,
 * `?:` в `data`, делегат в переменной (FIX-C6/FIX-C7 назвали их, но не закрыли).
 *
 * Что умеет:
 * - находит вызовы `<любое>.<модель>.<метод>(арг)`;
 * - обращение к делегату, которое НЕ вызывается сразу (`const b = tx.booking`
 *   с последующим `b.<метод>(…)`, `tx["booking"]`), — «непроверяемый сайт»;
 * - разрешает идентификатор-аргумент до инициализатора в той же функции
 *   (а также `?:`, скобки, `as`, `satisfies`, `!`) — `resolveObjects`;
 * - читает ведущие комментарии инструкции — посайтовые отметки
 *   (`// booking-status-write-ok: …`, `// conflict-scope-ok: …`).
 *
 * Слепые формы (названы, не закрыты): делегат, полученный из функции другого
 * модуля; аргумент, собранный в другом модуле; сырой SQL (`$executeRaw`).
 */

export const PRISMA_DELEGATE_METHODS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

export type PrismaCallSite = {
  file: string;
  line: number;
  method: string;
  call: ts.CallExpression;
  /** Первый аргумент как написан. */
  arg: ts.Expression | undefined;
  /** Ведущие комментарии инструкции, в которой стоит вызов. */
  marks: string[];
};

export type UncheckableSite = {
  file: string;
  line: number;
  reason: string;
  marks: string[];
};

export type ParsedFile = {
  sourceFile: ts.SourceFile;
  calls: PrismaCallSite[];
  uncheckable: UncheckableSite[];
};

export function parseSource(file: string, text: string): ts.SourceFile {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** Инструкция, к которой относится узел (ближайшая в блоке / файле / case). */
export function enclosingStatement(node: ts.Node): ts.Node {
  let cur: ts.Node = node;
  while (cur.parent) {
    const p = cur.parent;
    if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isCaseClause(p) || ts.isDefaultClause(p) || ts.isModuleBlock(p)) {
      return cur;
    }
    cur = p;
  }
  return cur;
}

/** Имя ближайшей именованной функции (объявление, метод, `const f = () =>`). */
export function enclosingFunctionName(node: ts.Node): string | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if ((ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur)) && cur.name && ts.isIdentifier(cur.name)) {
      return cur.name.text;
    }
    if (
      (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) &&
      ts.isVariableDeclaration(cur.parent) &&
      ts.isIdentifier(cur.parent.name)
    ) {
      return cur.parent.name.text;
    }
    cur = cur.parent;
  }
  return null;
}

/** Тексты ведущих комментариев инструкции (без `//` и `/* *\/`). */
export function leadingMarks(sf: ts.SourceFile, node: ts.Node): string[] {
  const statement = enclosingStatement(node);
  const ranges = ts.getLeadingCommentRanges(sf.text, statement.getFullStart()) ?? [];
  return ranges.map((r) =>
    sf.text
      .slice(r.pos, r.end)
      .replace(/^\/\/\s?/, "")
      .replace(/^\/\*+\s?|\s?\*+\/$/g, "")
      .trim(),
  );
}

export function hasMark(marks: string[], tag: string): boolean {
  return marks.some((m) => new RegExp(`^${tag}:\\s*\\S`).test(m));
}

function isModelAccess(node: ts.Node, model: string): boolean {
  if (ts.isPropertyAccessExpression(node)) return node.name.text === model;
  if (ts.isElementAccessExpression(node)) {
    return ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === model;
  }
  return false;
}

export function scanPrismaCalls(file: string, text: string, model: string): ParsedFile {
  const sourceFile = parseSource(file, text);
  const calls: PrismaCallSite[] = [];
  const uncheckable: UncheckableSite[] = [];
  /** Переменные, в которые положен сам делегат: `const b = tx.booking`. */
  const delegateVars = new Set<string>();

  const visit = (node: ts.Node) => {
    if (isModelAccess(node, model)) {
      const parent = node.parent;
      const direct =
        ts.isPropertyAccessExpression(node) &&
        parent &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        PRISMA_DELEGATE_METHODS.has(parent.name.text) &&
        parent.parent &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent;
      if (direct) {
        const call = parent.parent as ts.CallExpression;
        calls.push({
          file,
          line: lineOf(sourceFile, call),
          method: (parent as ts.PropertyAccessExpression).name.text,
          call,
          arg: call.arguments[0],
          marks: leadingMarks(sourceFile, call),
        });
      } else if (ts.isElementAccessExpression(node)) {
        uncheckable.push({
          file,
          line: lineOf(sourceFile, node),
          reason: `делегат через ["${model}"]`,
          marks: leadingMarks(sourceFile, node),
        });
      } else if (parent && ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
        delegateVars.add(parent.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (delegateVars.size > 0) {
    const visitAlias = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        delegateVars.has(node.expression.expression.text) &&
        PRISMA_DELEGATE_METHODS.has(node.expression.name.text)
      ) {
        uncheckable.push({
          file,
          line: lineOf(sourceFile, node),
          reason: `делегат в переменной «${node.expression.expression.text}» (.${node.expression.name.text})`,
          marks: leadingMarks(sourceFile, node),
        });
      }
      ts.forEachChild(node, visitAlias);
    };
    visitAlias(sourceFile);
  }

  return { sourceFile, calls, uncheckable };
}

function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isTypeAssertionExpression(cur)) cur = cur.expression;
    else if (ts.isNonNullExpression(cur)) cur = cur.expression;
    else return cur;
  }
}

/** Ближайшая функция (или файл), в которой ищется объявление идентификатора. */
function enclosingScope(node: ts.Node): ts.Node {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionLike(cur) || ts.isSourceFile(cur)) return cur;
    cur = cur.parent;
  }
  return node.getSourceFile();
}

export function findInitializer(identifier: ts.Identifier): ts.Expression | null {
  const name = identifier.text;
  let scope: ts.Node | undefined = enclosingScope(identifier);
  while (scope) {
    let found: ts.Expression | null = null;
    const search = (node: ts.Node) => {
      if (found) return;
      if (node !== scope && ts.isFunctionLike(node)) return; // вложенные функции — не наши объявления
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
        found = node.initializer;
        return;
      }
      ts.forEachChild(node, search);
    };
    ts.forEachChild(scope, search);
    if (found) return found;
    if (ts.isSourceFile(scope)) return null;
    scope = enclosingScope(scope);
  }
  return null;
}

/**
 * Возможные значения выражения как объектные литералы. `null` — разрешить не
 * удалось (параметр, вызов, импорт): вызывающий сторож трактует это как
 * «не доказано» и требует отметку.
 */
export function resolveObjects(expr: ts.Expression, depth = 0): ts.ObjectLiteralExpression[] | null {
  if (depth > 8) return null;
  const e = unwrap(expr);
  if (ts.isObjectLiteralExpression(e)) return [e];
  if (ts.isConditionalExpression(e)) {
    const a = resolveObjects(e.whenTrue, depth + 1);
    const b = resolveObjects(e.whenFalse, depth + 1);
    return a && b ? [...a, ...b] : null;
  }
  if (ts.isIdentifier(e)) {
    const init = findInitializer(e);
    return init ? resolveObjects(init, depth + 1) : null;
  }
  return null;
}

export type PropertyView = {
  /** Имя ключа, если оно статическое. */
  name: string | null;
  value: ts.Expression | null;
  /** Спред, который не удалось разрешить до литералов. */
  unresolvedSpread?: ts.Expression;
  node: ts.Node;
};

/**
 * Свойства объекта с развёрнутыми спредами (разрешимыми до литералов). Спред
 * вызова и спред неразрешимого идентификатора отдаются как `unresolvedSpread`.
 */
export function objectProperties(obj: ts.ObjectLiteralExpression, depth = 0): PropertyView[] {
  const out: PropertyView[] = [];
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const name = ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name) ? prop.name.text : null;
      out.push({ name, value: prop.initializer, node: prop });
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      out.push({ name: prop.name.text, value: prop.name, node: prop });
    } else if (ts.isSpreadAssignment(prop)) {
      const resolved = depth < 8 ? resolveObjects(prop.expression) : null;
      if (resolved) {
        for (const inner of resolved) out.push(...objectProperties(inner, depth + 1));
      } else {
        out.push({ name: null, value: null, unresolvedSpread: prop.expression, node: prop });
      }
    } else {
      out.push({ name: null, value: null, node: prop });
    }
  }
  return out;
}

/** Имя вызываемой функции у `f(…)` / `ns.f(…)`, иначе `null`. */
export function calleeName(expr: ts.Expression): string | null {
  const e = unwrap(expr);
  if (!ts.isCallExpression(e)) return null;
  const callee = e.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}
