// NODE-VERSION-PIN-01 (2026-10-29) — версия Node одна на разработку, CI и
// боевые образы: `.nvmrc`. Расхождение стоило бага TZ-HOUR-CYCLE-H23: локально
// стоял Node 24 (ICU 77), в CI и в `node:20-alpine` — Node 20.20 (ICU 78), где
// `Intl` пишет полночь «24:00». Тесты локально были зелёными, в CI — красными,
// на проде время уезжало на сутки.
//
// Запускается перед `npm run dev` / `build` / `test` / `worker` (pre-скрипты
// `package.json`) и падает, если Node не тот; `npm install` на чужой версии
// предупреждает по `engines`. `engine-strict` не ставится — он проверяет и
// `engines` зависимостей: одна с диапазоном без нашей версии остановила бы
// `npm ci` везде сразу (локально, в CI, в сборке образа). Совпадение `.nvmrc`,
// `engines`, workflow'ов и `FROM` в Dockerfile держит `scripts/node-version.test.ts`.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Закреплённая версия из `.nvmrc` — без `v` и пробелов. */
export function readPinnedNodeVersion(root = ROOT) {
  return readFileSync(join(root, ".nvmrc"), "utf8").trim().replace(/^v/, "");
}

/** Текст отказа, если запущенная версия не закреплённая; иначе `null`. */
export function nodeVersionMismatch(running, pinned) {
  if (running === pinned) return null;
  return [
    `Запущен Node ${running}, а проект закреплён на ${pinned} (.nvmrc) — та же версия, что в CI и в боевых образах.`,
    "Переключите версию: fnm use (или nvm use) — она берётся из .nvmrc.",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const message = nodeVersionMismatch(process.versions.node, readPinnedNodeVersion());
  if (message) {
    console.error(`✖ ${message}`);
    process.exit(1);
  }
}
