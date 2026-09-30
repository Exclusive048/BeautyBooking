/**
 * 29.09 доработки · 19 (PERF-12) — framer-motion едет в браузер лёгким набором.
 *
 * `MotionProvider` (`src/components/providers/motion-provider.tsx`) держит
 * `<LazyMotion features={domAnimation} strict>`, компоненты пишут `m.*`. Выигрыш
 * (framer в first-load `/` 42.1 → 15 kB gzip) ломается тремя способами, и два из
 * них молча:
 *
 * - (а) `import { motion }` — полный набор снова в чанке того, кто импортирует;
 *   внутри `strict` вдобавок бросает в рантайме (белый экран маршрута);
 * - (б) `domMax` / `LazyMotion` / `domAnimation` не в своих местах — полный набор
 *   утекает в общий чанк;
 * - (в) `layout` / `layoutId` / `drag…` на `<m.*>` вне островов — на лёгком наборе
 *   эти пропсы ТИХО не работают: элемент просто перестаёт анимироваться.
 *
 * Острова — два: сториз (`drag`, модуль и так ленивый) и лента `/notifications`
 * (`layout`, `domMax` догружается отдельным чанком). Полоса нижней навигации
 * переведена на CSS, тосты — на схлопывание высоты.
 *
 * Разбор импортов и JSX — компилятором (как в `prisma-enums.test.ts`).
 * Слепые формы (названы, не ловятся): пропсы через спред (`<m.div {...props}>`)
 * и компонент-обёртка, пробрасывающий `layout` дальше.
 *
 * @probe 2026-09-30:
 *   1. `import { m, motion }` + `<motion.div />` в
 *      `features/home/components/hero-section.tsx` → (а) красный:
 *      «src/features/home/components/hero-section.tsx — 5: value-импорт `motion`».
 *   2. `import { m }` + `<m.span layoutId="bottom-tab-indicator" />` в
 *      `components/layout/bottom-tab-bar.tsx` → (в) красный:
 *      «src/components/layout/bottom-tab-bar.tsx — layoutId@7 на <m.span>».
 *   3. `import { AnimatePresence, domMax, m }` в `components/ui/drawer.tsx` →
 *      (б) красный: «src/components/ui/drawer.tsx — domMax».
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { listSourceFiles, ROOT } from "@/lib/testing/client-graph";
import { parseSource } from "@/lib/testing/prisma-calls";

const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");

/** Кому можно импортировать «тяжёлые» имена и зачем. */
const HEAVY_IMPORTS: Record<string, string[]> = {
  "src/components/providers/motion-provider.tsx": ["LazyMotion", "MotionConfig", "domAnimation"],
  "src/components/providers/motion-dom-max.ts": ["domMax"],
  "src/features/home/components/stories-viewer-overlay.tsx": ["LazyMotion", "domMax"],
  "src/features/notifications/components/notifications-center-page.tsx": ["LazyMotion"],
};
const HEAVY_NAMES = new Set(["LazyMotion", "MotionConfig", "domAnimation", "domMax", "domMin"]);

/** Острова: пропсы вне `domAnimation` — только здесь. */
const ISLAND_PROPS: Record<string, string[]> = {
  "src/features/home/components/stories-viewer-overlay.tsx": ["drag", "dragConstraints", "dragElastic", "onDragEnd"],
  "src/features/notifications/components/notifications-center-page.tsx": ["layout"],
};
const FULL_SET_PROPS = new Set([
  "layout",
  "layoutId",
  "layoutDependency",
  "layoutScroll",
  "layoutRoot",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "dragListener",
  "dragControls",
  "dragSnapToOrigin",
  "whileDrag",
  "onDrag",
  "onDragStart",
  "onDragEnd",
]);

/** Динамический загрузчик полного набора — только у островов, которым он нужен. */
const DOM_MAX_LOADERS = new Set(["src/features/notifications/components/notifications-center-page.tsx"]);

type Report = { imports: string[]; heavy: string[]; props: string[]; loaders: string[] };

function scanMotionUsage(file: string, text: string): Report {
  const sf = parseSource(file, text);
  const report: Report = { imports: [], heavy: [], props: [], loaders: [] };
  const mNames = new Set<string>();
  const line = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  for (const st of sf.statements) {
    const isFramer =
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      st.moduleSpecifier.text === "framer-motion";
    if (!isFramer) continue;
    if (ts.isImportDeclaration(st)) {
      const clause = st.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const nb = clause.namedBindings;
      if (clause.name) report.imports.push(`${line(st)}: default-импорт framer-motion`);
      if (nb && ts.isNamespaceImport(nb)) report.imports.push(`${line(st)}: namespace-импорт framer-motion`);
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          if (el.isTypeOnly) continue;
          const imported = (el.propertyName ?? el.name).text;
          if (imported === "motion") report.imports.push(`${line(el)}: value-импорт \`motion\``);
          if (imported === "m") mNames.add(el.name.text);
          if (HEAVY_NAMES.has(imported)) report.heavy.push(imported);
        }
      }
    } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) report.heavy.push((el.propertyName ?? el.name).text);
    } else {
      report.heavy.push("export *");
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) && mNames.has(tag.expression.text)) {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && FULL_SET_PROPS.has(attr.name.text)) {
            report.props.push(`${attr.name.text}@${line(attr)} на <${tag.getText(sf)}>`);
          }
        }
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.endsWith("/motion-dom-max")
    ) {
      report.loaders.push(`${line(node)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return report;
}

describe("машинерия разбора framer-motion", () => {
  it("видит value-импорт motion, тяжёлые имена, пропсы полного набора и загрузчик", () => {
    const r = scanMotionUsage(
      "fixture.tsx",
      [
        'import { m as mm, motion, domMax, type Variants } from "framer-motion";',
        'import type { Transition } from "framer-motion";',
        "const load = () => import(\"@/components/providers/motion-dom-max\");",
        "export const A = () => <mm.div layoutId=\"x\" drag=\"y\" initial={{ opacity: 0 }} />;",
        "export const B = () => <motion.span layout />;",
      ].join("\n"),
    );
    expect(r.imports).toHaveLength(1);
    expect(r.heavy).toEqual(["domMax"]);
    expect(r.props.map((p) => p.split("@")[0])).toEqual(["layoutId", "drag"]);
    expect(r.loaders).toHaveLength(1);
  });
});

describe("framer-motion: лёгкий набор (PERF-12)", () => {
  const files = listSourceFiles().filter((file) => readFileSync(file, "utf8").includes("framer-motion") || readFileSync(file, "utf8").includes("motion-dom-max"));
  const reports = files.map((file) => [rel(file), scanMotionUsage(file, readFileSync(file, "utf8"))] as const);

  it("обход нашёл потребителей (иначе проверки ниже вакуумны)", () => {
    expect(reports.length).toBeGreaterThan(40);
  });

  it("(а) нет value-импорта `motion` и namespace/default-импорта framer-motion", () => {
    const violations = reports.flatMap(([file, r]) => r.imports.map((row) => `${file} — ${row}`));
    expect(violations, "компоненты пишут `m.*` (LazyMotion strict в MotionProvider)").toEqual([]);
  });

  it("(б) LazyMotion / MotionConfig / domAnimation / domMax — только в реестре", () => {
    const violations: string[] = [];
    for (const [file, r] of reports) {
      const allowed = new Set(HEAVY_IMPORTS[file] ?? []);
      for (const name of r.heavy) if (!allowed.has(name)) violations.push(`${file} — ${name}`);
      if (r.loaders.length > 0 && !DOM_MAX_LOADERS.has(file)) violations.push(`${file} — import(motion-dom-max)`);
    }
    expect(violations, "полный набор framer — только в островах (реестр HEAVY_IMPORTS)").toEqual([]);
  });

  it("(в) layout / layoutId / drag… на <m.*> — только в островах", () => {
    const violations: string[] = [];
    for (const [file, r] of reports) {
      const allowed = new Set(ISLAND_PROPS[file] ?? []);
      for (const row of r.props) if (!allowed.has(row.split("@")[0])) violations.push(`${file} — ${row}`);
    }
    expect(
      violations,
      "на лёгком наборе (domAnimation) эти пропсы молча не работают: CSS-переход, схлопывание высоты или остров с domMax",
    ).toEqual([]);
  });

  it("реестры не протухли", () => {
    const byFile = new Map(reports);
    for (const [file, names] of Object.entries(HEAVY_IMPORTS)) {
      const r = byFile.get(file);
      expect(r, `${file} из HEAVY_IMPORTS не найден`).toBeDefined();
      for (const name of names) expect(r!.heavy, `${file}: ${name}`).toContain(name);
    }
    for (const [file, props] of Object.entries(ISLAND_PROPS)) {
      const used = new Set(byFile.get(file)?.props.map((p) => p.split("@")[0]) ?? []);
      for (const prop of props) expect(used.has(prop), `${file}: ${prop} больше не используется`).toBe(true);
    }
  });
});
