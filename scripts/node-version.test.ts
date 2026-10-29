import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeVersionMismatch, readPinnedNodeVersion } from "./check-node-version.mjs";

/**
 * NODE-VERSION-PIN-01 (2026-10-29) — одна версия Node на разработку, CI и
 * боевые образы. Источник — `.nvmrc`; с ним совпадают `engines` в
 * `package.json`, `FROM node:` в каждом Dockerfile и `setup-node` в workflow'ах
 * (только `node-version-file: .nvmrc`, литерал `node-version:` запрещён).
 *
 * `engine-strict` в `.npmrc` не ставится: он проверяет `engines` КАЖДОЙ
 * зависимости, а `lighthouse` (`npm run lighthouse`) требует Node ≥ 22.19 —
 * `npm ci` на 20 отказал бы и локально, и в CI, и в сборке образа. Жёсткая
 * проверка — pre-скрипты запуска (`dev`, `build`, `test`, `worker`).
 *
 * Повод — TZ-HOUR-CYCLE-H23: локально Node 24 (ICU 77), в CI `node-version: 20`
 * и плавающий `node:20-alpine` (Node 20.20, ICU 78). На ICU 78 `Intl` пишет
 * полночь «24:00» — локально зелёно, в CI красно, на проде время на сутки раньше.
 *
 * @probe 2026-10-29 — в `Dockerfile` возвращён `FROM node:20-alpine` (стадия
 * runner): красный «каждый FROM node: в Dockerfile — закреплённая версия»
 * (`Dockerfile: node:20-alpine`). В `ci.yml` возвращён `node-version: 20`:
 * красный «setup-node берёт версию только из .nvmrc». `engines.node` = "20":
 * красный «engines.node в package.json — закреплённая версия». Возвращено —
 * зелёный.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const pinned = readPinnedNodeVersion(ROOT);

describe("NODE-VERSION-PIN-01 · версия Node одна: .nvmrc", () => {
  it(".nvmrc — точная версия, без диапазона", () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("engines.node в package.json — закреплённая версия", () => {
    const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe(pinned);
  });

  it("каждый FROM node: в Dockerfile — закреплённая версия", () => {
    const dockerfiles = readdirSync(ROOT).filter((name) => /^Dockerfile/.test(name));
    // Сторож не пустой: оба образа на месте.
    expect(dockerfiles).toEqual(expect.arrayContaining(["Dockerfile", "Dockerfile.worker"]));

    const images = dockerfiles.flatMap((name) =>
      [...read(name).matchAll(/^\s*FROM\s+(node:\S+)/gim)].map((match) => `${name}: ${match[1]}`),
    );
    expect(images.length).toBeGreaterThanOrEqual(5);
    expect(images.filter((line) => !line.endsWith(`node:${pinned}-alpine`))).toEqual([]);
  });

  it("образы compose не подставляют свой node", () => {
    const composeFiles = readdirSync(ROOT).filter((name) => /^docker-compose.*\.ya?ml$/.test(name));
    const nodeImages = composeFiles.flatMap((name) =>
      [...read(name).matchAll(/^\s*image:\s*["']?(node:\S+?)["']?\s*$/gim)].map((match) => `${name}: ${match[1]}`),
    );
    expect(nodeImages.filter((line) => !line.endsWith(`node:${pinned}-alpine`))).toEqual([]);
  });

  it("setup-node берёт версию только из .nvmrc", () => {
    const dir = join(ROOT, ".github", "workflows");
    const workflows = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
    const offenders: string[] = [];
    let setups = 0;
    for (const name of workflows) {
      const lines = readFileSync(join(dir, name), "utf8")
        .split(/\r?\n/)
        .filter((line) => !/^\s*#/.test(line));
      lines.forEach((line, index) => {
        if (/^\s*node-version\s*:/.test(line)) offenders.push(`${name}: ${line.trim()}`);
        if (!/uses:\s*actions\/setup-node@/.test(line)) return;
        setups += 1;
        const block = lines.slice(index + 1, index + 6).join("\n");
        if (!/node-version-file:\s*\.nvmrc/.test(block)) offenders.push(`${name}: setup-node без node-version-file: .nvmrc`);
      });
    }
    expect(setups).toBeGreaterThanOrEqual(2);
    expect(offenders).toEqual([]);
  });

  it("dev, build, test и worker сначала сверяют версию Node", () => {
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    for (const name of ["dev", "build", "test", "worker"]) {
      expect(scripts[`pre${name}`], `pre${name}`).toBe("node scripts/check-node-version.mjs");
    }
  });

  it("проверка отказывает на чужой версии и называет обе", () => {
    expect(nodeVersionMismatch(pinned, pinned)).toBeNull();
    const message = nodeVersionMismatch("24.13.0", pinned);
    expect(message).toContain("24.13.0");
    expect(message).toContain(pinned);
    expect(message).toContain("fnm use");
  });
});
