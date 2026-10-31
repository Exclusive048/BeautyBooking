import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * PRISMA-ENGINE-DOWNLOAD (2026-10-31) — сборка образов на ВМ не зависит от
 * одного удачного соединения с binaries.prisma.sh.
 *
 * Повод: автодеплой упал на `RUN npx prisma generate` сборки web — «Client
 * network socket disconnected before secure TLS connection was established» при
 * скачивании движка запросов, хотя воркер минутой раньше скачал тот же движок.
 * Прод не пострадал (сборка — до снимка, миграций и `up -d`), но обнажились два
 * дефекта:
 *   1. движок качался при КАЖДОЙ генерации, без кэша и без повтора;
 *   2. шаг 2/7 деплоя брал `:previous` от тега `:latest`, а упавшая на середине
 *      сборка уже переписала `beautyhub-worker:latest` новым образом — следующий
 *      деплой записал бы в `:previous` версию, которая не запускалась ни разу.
 *
 * Сторож проверяет поведение, а не текст: цикл повтора из Dockerfile и функция
 * `tag_previous` из deploy.yml исполняются настоящим `sh` с заглушками `npx`,
 * `sleep`, `docker compose` и `docker`. Кэш BuildKit без Docker не исполнить —
 * для него проверяется флаг монтирования и одинаковость шага во всех Dockerfile.
 *
 * @probe 2026-10-31 — в Dockerfile возвращён голый `RUN npx prisma generate`:
 * красные все четыре теста шага (`expected 'RUN npx prisma generate' to contain
 * '--mount=type=cache,id=prisma-engines,…'`; «пять провалов» — `got 1`). В
 * обоих Dockerfile цикл сокращён до двух попыток: красные «сбой сети на двух
 * попытках» (`expected 1 to be +0`) и «пять провалов» (`got 2`). В deploy.yml
 * возвращена прежняя пара `image tag …:latest …:previous`: красные все четыре
 * теста деплоя («функции tag_previous в deploy.yml нет»). В `tag_previous`
 * ветки переставлены (сначала `:latest`): красный «при работающих контейнерах
 * :previous — их образы» (в журнале `beautyhub-app:latest -> …`). Возвращено —
 * зелёный.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const DOCKERFILES = readdirSync(ROOT).filter((name) => /^Dockerfile/.test(name));
const DEPLOY = read(".github/workflows/deploy.yml");
const CACHE_MOUNT = "--mount=type=cache,id=prisma-engines,target=/root/.cache/prisma";

/** Инструкции RUN с продолжениями строк, склеенные в одну строку. */
function runInstructions(source: string): string[] {
  const lines = source.split("\n");
  const runs: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^RUN\s/.test(lines[i])) continue;
    let text = lines[i].trimEnd();
    while (text.endsWith("\\") && i + 1 < lines.length) {
      i += 1;
      text = `${text.slice(0, -1).trimEnd()} ${lines[i].trim()}`;
    }
    runs.push(text);
  }
  return runs;
}

const generateRuns = (name: string) =>
  runInstructions(read(name)).filter((run) => /prisma\s+generate/.test(run));

/** Команда оболочки инструкции RUN — без `RUN` и флагов `--mount=…`. */
const shellOf = (run: string) => run.replace(/^RUN\s+(?:--\S+\s+)*/, "");

let sandbox: string | null = null;

afterEach(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  sandbox = null;
});

function stubs(files: Record<string, string>): string {
  sandbox = mkdtempSync(join(tmpdir(), "prisma-engine-download-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(sandbox, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
  return sandbox;
}

/**
 * `sh` и каталог с `cat`/`head`. На Windows вне Git Bash `sh` в PATH нет — берём
 * его из установки Git (`git --exec-path` → `<git>/mingw64/libexec/git-core`).
 */
function resolveSh(): { sh: string; binDirs: string[] } {
  if (process.platform !== "win32") return { sh: "sh", binDirs: [] };
  const execPath = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim();
  const usrBin = join(execPath, "..", "..", "..", "usr", "bin");
  return { sh: join(usrBin, "sh.exe"), binDirs: [usrBin] };
}

const SHELL = resolveSh();

function runSh(script: string, dir: string, extraEnv: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const inherited = env[pathKey] ?? "";
  delete env[pathKey];
  const result = spawnSync(SHELL.sh, ["-c", script], {
    encoding: "utf8",
    env: { ...env, ...extraEnv, PATH: [dir, ...SHELL.binDirs, inherited].join(delimiter) },
  });
  if (result.error) throw result.error;
  const log = (name: string) => {
    try {
      return readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  return { status: result.status, output: `${result.stdout}${result.stderr}`, log };
}

describe("PRISMA-ENGINE-DOWNLOAD · prisma generate в образах", () => {
  it("каждый prisma generate идёт через общий кэш движков", () => {
    expect(DOCKERFILES).toEqual(expect.arrayContaining(["Dockerfile", "Dockerfile.worker"]));
    for (const name of DOCKERFILES) {
      const runs = generateRuns(name);
      expect(runs.length, `${name}: шага prisma generate нет`).toBeGreaterThan(0);
      for (const run of runs) expect(run, name).toContain(CACHE_MOUNT);
    }
  });

  it("шаг одинаков во всех Dockerfile (кэш общий, повтор один)", () => {
    const all = DOCKERFILES.flatMap((name) => generateRuns(name));
    expect(new Set(all).size).toBe(1);
  });

  // Заглушка npx падает первые FAILS раз; sleep только записывает паузу.
  const npxAndSleep = {
    npx: [
      'n=$(cat "$STUB_DIR/count" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$STUB_DIR/count"',
      'echo "$*" >> "$STUB_DIR/npx.log"',
      '[ "$n" -gt "$FAILS" ]',
    ].join("\n"),
    sleep: 'echo "$1" >> "$STUB_DIR/sleep.log"',
  };

  it("сбой сети на двух попытках — третья проходит, сборка идёт дальше", () => {
    const dir = stubs(npxAndSleep);
    const { status, log } = runSh(shellOf(generateRuns("Dockerfile")[0]), dir, {
      STUB_DIR: dir,
      FAILS: "2",
    });
    expect(status).toBe(0);
    expect(log("npx.log")).toEqual(["prisma generate", "prisma generate", "prisma generate"]);
    expect(log("sleep.log")).toEqual(["15", "30"]);
  });

  it("пять провалов подряд — сборка падает, а не идёт дальше", () => {
    const dir = stubs(npxAndSleep);
    const { status, log } = runSh(shellOf(generateRuns("Dockerfile")[0]), dir, {
      STUB_DIR: dir,
      FAILS: "99",
    });
    expect(status).not.toBe(0);
    expect(log("npx.log")).toHaveLength(5);
    // После последней попытки не ждём впустую.
    expect(log("sleep.log")).toEqual(["15", "30", "45", "60"]);
  });
});

describe("PRISMA-ENGINE-DOWNLOAD · deploy.yml: :previous — образ работающего контейнера", () => {
  const script = DEPLOY.slice(DEPLOY.indexOf("script: |"));

  /** Функция `tag_previous` и её вызовы — дословно из deploy.yml. */
  function tagPreviousScript(): string {
    const lines = script.split("\n");
    const start = lines.findIndex((line) => /^\s*tag_previous\(\) \{/.test(line));
    expect(start, "функции tag_previous в deploy.yml нет").toBeGreaterThanOrEqual(0);
    const indent = lines[start].match(/^\s*/)![0];
    const end = lines.findIndex((line, i) => i > start && line === `${indent}}`);
    const calls = lines.filter((line) => /^\s*tag_previous \S+ \S+\s*$/.test(line));
    return ["set -eu", ...lines.slice(start, end + 1), ...calls].map((line) => line.trim()).join("\n");
  }

  // compose ps -a -q <svc> → id из RUNNING ("web=cid1 worker=cid2");
  // docker inspect -f … <id> → sha256:img-<id>; docker image tag <от> <к> → в журнал,
  // а тег от <репо>:latest, перечисленного в NO_LATEST, проваливается.
  const composeAndDocker = {
    "fake-compose": [
      'svc="$4"',
      'for pair in $RUNNING; do [ "${pair%%=*}" = "$svc" ] && echo "${pair#*=}"; done',
      "exit 0",
    ].join("\n"),
    "fake-docker": [
      'if [ "$1" = inspect ]; then echo "sha256:img-$4"; exit 0; fi',
      'if [ "$1" = image ] && [ "$2" = tag ]; then',
      '  for repo in $NO_LATEST; do [ "$3" = "$repo:latest" ] && exit 1; done',
      '  echo "$3 -> $4" >> "$STUB_DIR/tags.log"; exit 0',
      "fi",
      "exit 1",
    ].join("\n"),
  };

  function tagPrevious(env: { RUNNING: string; NO_LATEST: string }) {
    const dir = stubs(composeAndDocker);
    return runSh(tagPreviousScript(), dir, {
      ...env,
      STUB_DIR: dir,
      COMPOSE: "fake-compose",
      DOCKER: "fake-docker",
    });
  }

  it("при работающих контейнерах :previous — их образы, а не :latest", () => {
    // Сборка прошлого деплоя упала после воркера: worker:latest уже новый.
    const { status, log } = tagPrevious({ RUNNING: "web=cid-web worker=cid-worker", NO_LATEST: "" });
    expect(status).toBe(0);
    expect(log("tags.log")).toEqual([
      "sha256:img-cid-web -> beautyhub-app:previous",
      "sha256:img-cid-worker -> beautyhub-worker:previous",
    ]);
  });

  it("контейнера нет — :previous от :latest", () => {
    const { status, log } = tagPrevious({ RUNNING: "", NO_LATEST: "" });
    expect(status).toBe(0);
    expect(log("tags.log")).toEqual([
      "beautyhub-app:latest -> beautyhub-app:previous",
      "beautyhub-worker:latest -> beautyhub-worker:previous",
    ]);
  });

  it("первый деплой (ни контейнеров, ни образов) — без тегов и без падения под set -eu", () => {
    const { status, log, output } = tagPrevious({
      RUNNING: "",
      NO_LATEST: "beautyhub-app beautyhub-worker",
    });
    expect(status).toBe(0);
    expect(log("tags.log")).toEqual([]);
    expect(output).toContain("первый деплой");
  });

  it(":previous ставится до сборки", () => {
    const tagAt = script.indexOf("tag_previous web beautyhub-app");
    expect(tagAt).toBeGreaterThan(0);
    expect(tagAt).toBeLessThan(script.indexOf("$COMPOSE build worker"));
    expect(tagAt).toBeLessThan(script.indexOf("$COMPOSE build web"));
  });
});
