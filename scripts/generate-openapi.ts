// OPENAPI-FRESH (2026-11-14): `openapi/openapi.json` собирается из
// `src/lib/openapi/spec.ts` напрямую, без живого сервера.
//
// Прежний `generate-openapi.mjs` скачивал спеку с `localhost:3000/api/openapi`
// и без сервера печатал «skipped (server not reachable)» с кодом 0 — в CI
// сервера нет никогда, поэтому файл в репозитории обновлялся только руками и
// отставал от спеки молча. Теперь шаг детерминирован: тот же объект, что отдаёт
// `/api/openapi`, тем же `JSON.stringify(…, null, 2)`. Свежесть закоммиченного
// файла сверяет CI (`git diff --exit-code` сразу после этого шага).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getOpenApiSpec } from "../src/lib/openapi/spec";

const OUT_PATH = "openapi/openapi.json";

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(getOpenApiSpec(), null, 2)}\n`, "utf8");
console.log(`openapi: ${OUT_PATH} собран из src/lib/openapi/spec.ts`);
