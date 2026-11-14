import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CI-REQUIRED-CHECK-NAME (2026-11-14) — имена джобов, которые защита ветки
 * `main` требует как обязательные проверки, заморожены.
 *
 * GitHub сопоставляет обязательную проверку с прогоном по ИМЕНИ джоба. Коммит,
 * убравший `check:context-freshness`, «поправил» счётчик в имени
 * `npm run check (18 шагов) + npm run test` на 17 — и PR встал в «Expected —
 * Waiting for status to be reported»: проверку со старым именем больше никто
 * не запускал, а новое имя защита ветки не знает. Ни один гейт этого не видит:
 * сам CI зелёный, ломается только мерж.
 *
 * Список — из настроек защиты ветки (AUTO-DEPLOY-01, `DEPLOY-BACKLOG.md`).
 * Сменить имя джоба можно только вместе с обязательной проверкой в
 * Settings → Branches → main, и тогда — вместе с этим списком.
 *
 * @probe 2026-11-14 — в `ci.yml` имя джоба `quality` возвращено на
 * `npm run check (17 шагов) + npm run test`: красный «обязательная проверка
 * „npm run check (18 шагов) + npm run test“ — имя джоба в .github/workflows/ci.yml»
 * (`expected [ …17 шагов… ] to include 'npm run check (18 шагов) + npm run test'`).
 * Возвращено — зелёный.
 */

const ROOT = process.cwd();

const REQUIRED_CHECKS: ReadonlyArray<{ workflow: string; jobName: string }> = [
  { workflow: ".github/workflows/ci.yml", jobName: "npm run check (18 шагов) + npm run test" },
  { workflow: ".github/workflows/build-images.yml", jobName: "app image (Dockerfile)" },
  { workflow: ".github/workflows/build-images.yml", jobName: "worker image (Dockerfile.worker)" },
];

/** Имена джобов workflow: строки `name:` с отступом в 4 пробела внутри `jobs:`. */
function readJobNames(workflowPath: string): string[] {
  const source = readFileSync(join(ROOT, workflowPath), "utf8");
  const jobsAt = source.search(/^jobs:\s*$/m);
  expect(jobsAt, `${workflowPath}: нет секции jobs:`).toBeGreaterThanOrEqual(0);
  return [...source.slice(jobsAt).matchAll(/^ {4}name:\s*(.+?)\s*$/gm)].map((match) =>
    match[1].replace(/^(["'])(.*)\1$/, "$2"),
  );
}

describe("CI-REQUIRED-CHECK-NAME · обязательные проверки main не переименовываются", () => {
  for (const { workflow, jobName } of REQUIRED_CHECKS) {
    it(`обязательная проверка «${jobName}» — имя джоба в ${workflow}`, () => {
      expect(readJobNames(workflow)).toContain(jobName);
    });
  }
});
