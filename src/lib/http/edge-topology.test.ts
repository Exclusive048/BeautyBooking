import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MEDIA_MAX_FILE_SIZE_BYTES } from "@/lib/media/types";

/**
 * APP-TIER-SPLIT-01 (2026-08-30) — ярус приложения: один образ, два контейнера
 * (`web` — страницы, `api` — `/api/*`) за внутренним nginx `edge`.
 *
 * Что здесь сторожится и почему это не «форма конфига ради формы»:
 *
 * 1. **Трастовая модель клиентского IP.** `edge` передаёт `X-Forwarded-For`
 *    СКВОЗНЫМ (`$http_x_forwarded_for`), а не дописывает свой адрес
 *    (`$proxy_add_x_forwarded_for`), поэтому он НЕ хоп для `TRUSTED_PROXY_HOPS`
 *    и значение при переходе не меняется. Это безопасно только пока порт
 *    опубликован на loopback. Смена любого из двух фактов молча ломает per-IP
 *    лимиты в одну из сторон (§10 контекста: хопов меньше — лимиты общие,
 *    больше — обходимые), и ни ошибки, ни лога при этом нет.
 * 2. **Секрет вебхука не в access-log.** `?token=` ЮКассы едет в query-строке
 *    (DEPLOY-CHECKLIST 3.9); формат лога обязан использовать `$uri`, а не
 *    `$request` / `$request_uri` / `$args`. Стандартный `combined` вернул бы
 *    секрет в лог одной строкой правки.
 * 3. **Маршруты.** `/api/*` → api, остальное → web; SSE-стрим без буферизации
 *    и без 60-секундного обрыва — иначе уведомления «работают» ровно минуту.
 * 4. **Лимит тела ≥ лимита загрузки медиа.** Дефолт nginx 1m молча ломает
 *    портфолио (10 МБ); константа берётся из кода, а не дублируется числом.
 * 5. **Паритет web/api и единственность публикации порта.** Оба контейнера —
 *    один `node server.js`; разойдись их runtime-блоки (env_file, grace,
 *    healthcheck) — половина трафика жила бы по другим правилам. Порт наружу —
 *    только у edge.
 * 6. **deploy.yml согласован**: собирает `web` (api берёт тот же тег), ждёт
 *    healthy у всех трёх, откатывает `web api worker`, на `app` не ссылается.
 *
 * @probe 2026-08-30 — сторож доведён пробами по правилу #43:
 *   • `$http_x_forwarded_for` → `$proxy_add_x_forwarded_for` в default.conf —
 *     красный: «edge дописывает свой адрес в XFF — это меняет число хопов»;
 *   • `$uri` → `$request` в log_format — красный: «формат access-log содержит
 *     query-строку»;
 *   • `client_max_body_size 16m` → `1m` — красный с числами обеих сторон;
 *   • `ports:` перенесён на `api` — красный: «порт публикует не только edge»;
 *   • `up -d --no-deps web api worker` → `app worker` в deploy.yml — красный.
 */

const ROOT = process.cwd();
const COMPOSE = readFileSync(resolve(ROOT, "docker-compose.prod.yml"), "utf8");
const EDGE_CONF = readFileSync(resolve(ROOT, "deploy/edge/default.conf"), "utf8");
const DEPLOY = readFileSync(resolve(ROOT, ".github/workflows/deploy.yml"), "utf8");

/** Блок сервиса верхнего уровня (2 пробела отступа) без соседей. */
function serviceBlock(name: string): string | null {
  const block = COMPOSE.split(/^ {2}(?=\S)/m).find((chunk) => chunk.startsWith(`${name}:`));
  return block ?? null;
}

/** Ключ на уровне сервиса (ровно 4 пробела) — комментарии с `#` не проходят. */
function hasServiceKey(block: string, key: string): boolean {
  return new RegExp(`^ {4}${key}:`, "m").test(block);
}

/** nginx-конфиг без комментариев: шапка законно описывает то, что запрещено. */
function stripNginxComments(conf: string): string {
  return conf
    .split("\n")
    .map((line) => line.replace(/\s#.*$/, "").replace(/^#.*$/, ""))
    .join("\n");
}

const EDGE = stripNginxComments(EDGE_CONF);

function parseBodyLimitBytes(conf: string): number | null {
  const match = conf.match(/client_max_body_size\s+(\d+)([kmg]?)\s*;/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factor = unit === "g" ? 1024 ** 3 : unit === "m" ? 1024 ** 2 : unit === "k" ? 1024 : 1;
  return value * factor;
}

describe("APP-TIER-SPLIT-01 · compose: один образ, web + api за edge", () => {
  const edge = serviceBlock("edge");
  const web = serviceBlock("web");
  const api = serviceBlock("api");

  it("сервисы edge / web / api есть, монолитного app больше нет", () => {
    expect(edge, "нет сервиса edge").toBeTruthy();
    expect(web, "нет сервиса web").toBeTruthy();
    expect(api, "нет сервиса api").toBeTruthy();
    expect(serviceBlock("app"), "сервис app должен быть разведён на web/api").toBeNull();
  });

  it("web и api берут ОДИН образ, build: объявлен только у web", () => {
    expect(web!).toMatch(/^ {4}image: beautyhub-app:latest$/m);
    expect(api!).toMatch(/^ {4}image: beautyhub-app:latest$/m);
    expect(hasServiceKey(web!, "build")).toBe(true);
    expect(hasServiceKey(api!, "build"), "api не должен собирать образ второй раз").toBe(false);
  });

  it("порт наружу публикует ТОЛЬКО edge, и только на loopback", () => {
    for (const [name, block] of Object.entries({ web, api, worker: serviceBlock("worker") })) {
      expect(hasServiceKey(block!, "ports"), `порт публикует не только edge: ${name}`).toBe(false);
    }
    expect(hasServiceKey(edge!, "ports")).toBe(true);
    // Сквозной XFF в default.conf держится на этом: наружу (0.0.0.0) = доверить
    // клиентскому X-Forwarded-For.
    expect(edge!).toMatch(/^ {6}- "127\.0\.0\.1:3000:80"$/m);
    expect(edge!).not.toMatch(/^ {6}- "(0\.0\.0\.0:)?3000:/m);
  });

  it("edge монтирует deploy/edge/default.conf только на чтение", () => {
    expect(edge!).toMatch(/\.\/deploy\/edge\/default\.conf:\/etc\/nginx\/conf\.d\/default\.conf:ro/);
  });

  it("edge не ждёт healthy у половин — иначе мёртвый api остановил бы и web", () => {
    const dependsOn = edge!.match(/^ {4}depends_on:\n([\s\S]*?)^ {4}\S/m)?.[1] ?? "";
    expect(dependsOn).toMatch(/web:\n\s+condition: service_started/);
    expect(dependsOn).toMatch(/api:\n\s+condition: service_started/);
    expect(dependsOn).not.toMatch(/service_healthy/);
  });

  it("runtime-блоки web и api зеркальны: env_file, stop_grace_period, depends_on, healthcheck", () => {
    const pick = (block: string, key: string): string | null => {
      const single = block.match(new RegExp(`^ {4}${key}: (.+)$`, "m"));
      if (single) return single[1].trim();
      const nested = block.match(new RegExp(`^ {4}${key}:\\n([\\s\\S]*?)(?=^ {4}\\S|(?![\\s\\S]))`, "m"));
      if (!nested) return null;
      // Комментарии внутри блока различаются (у api — ссылка на web), сравниваем код.
      return nested[1]
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .join("\n");
    };
    for (const key of ["env_file", "stop_grace_period", "restart", "depends_on", "healthcheck", "networks"]) {
      const w = pick(web!, key);
      const a = pick(api!, key);
      expect(w, `у web нет ${key}`).toBeTruthy();
      expect(a, `у api нет ${key}: половина трафика жила бы по другим правилам`).toBe(w);
    }
  });
});

describe("APP-TIER-SPLIT-01 · deploy/edge/default.conf", () => {
  it("/api/* → api, остальное → web; имена резолвятся через встроенный DNS в момент запроса", () => {
    expect(EDGE).toMatch(/set \$api http:\/\/api:3000;/);
    expect(EDGE).toMatch(/set \$web http:\/\/web:3000;/);
    expect(EDGE).toMatch(/location \^~ \/api\/ \{\s*proxy_pass \$api;/);
    expect(EDGE).toMatch(/location \/ \{\s*proxy_pass \$web;/);
    // Без resolver + переменной nginx резолвит имя один раз на старте и после
    // пересоздания контейнера (новый IP на каждом деплое) отдаёт 502 до рестарта.
    expect(EDGE).toMatch(/resolver 127\.0\.0\.11/);
    expect(EDGE).not.toMatch(/proxy_pass http:\/\/(web|api):3000/);
  });

  it("SSE-стрим: без буферизации и без минутного обрыва", () => {
    const sse = EDGE.match(/location = \/api\/notifications\/stream \{([\s\S]*?)\}/)?.[1] ?? "";
    expect(sse, "нет отдельной location для SSE").toBeTruthy();
    expect(sse).toMatch(/proxy_pass \$api;/);
    expect(sse).toMatch(/proxy_buffering off;/);
    const readTimeout = sse.match(/proxy_read_timeout\s+(\d+)([smh]?)/);
    expect(readTimeout, "SSE без длинного proxy_read_timeout обрывается через 60 с").toBeTruthy();
    const unit = readTimeout![2] || "s";
    const seconds = Number(readTimeout![1]) * (unit === "h" ? 3600 : unit === "m" ? 60 : 1);
    expect(seconds).toBeGreaterThanOrEqual(600);
  });

  it("edge НЕ хоп: X-Forwarded-* идут сквозными, real_ip-модуль не используется", () => {
    expect(EDGE).toMatch(/proxy_set_header X-Forwarded-For\s+\$http_x_forwarded_for;/);
    expect(EDGE).toMatch(/proxy_set_header X-Forwarded-Proto\s+\$http_x_forwarded_proto;/);
    expect(
      EDGE.includes("$proxy_add_x_forwarded_for"),
      "edge дописывает свой адрес в XFF — это меняет число хопов для TRUSTED_PROXY_HOPS",
    ).toBe(false);
    expect(EDGE).not.toMatch(/\b(real_ip_header|set_real_ip_from|real_ip_recursive)\b/);
  });

  it("access-log без query-строки (секрет вебхука ЮКассы едет в ?token=)", () => {
    const logFormat = EDGE.match(/log_format\s+(\w+)\s+([\s\S]*?);/);
    expect(logFormat, "нет собственного log_format").toBeTruthy();
    const [, name, body] = logFormat!;
    expect(body).toContain("$uri");
    for (const forbidden of ["$request ", '$request"', "$request_uri", "$args", "$query_string", "$request_uri"]) {
      expect(body.includes(forbidden), `формат access-log содержит query-строку: ${forbidden}`).toBe(false);
    }
    expect(EDGE).toMatch(new RegExp(`access_log\\s+\\S+\\s+${name};`));
    expect(EDGE).not.toMatch(/access_log\s+\S+\s+combined;/);
    expect(EDGE).not.toMatch(/access_log\s+\S+;\s*$/m);
  });

  it("лимит тела не ниже лимита загрузки медиа (дефолт nginx 1m ломал бы портфолио)", () => {
    const limit = parseBodyLimitBytes(EDGE);
    expect(limit, "client_max_body_size не задан — действует дефолт 1m").not.toBeNull();
    expect(
      limit!,
      `client_max_body_size=${limit} < MEDIA_MAX_FILE_SIZE_BYTES=${MEDIA_MAX_FILE_SIZE_BYTES}`,
    ).toBeGreaterThanOrEqual(MEDIA_MAX_FILE_SIZE_BYTES);
  });
});

describe("APP-TIER-SPLIT-01 · deploy.yml согласован с топологией", () => {
  it("собирает web (api берёт тот же тег) и не ссылается на сервис app", () => {
    expect(DEPLOY).toMatch(/\$COMPOSE build web/);
    expect(DEPLOY).not.toMatch(/\$COMPOSE build app\b/);
    expect(DEPLOY).not.toMatch(/ps -q app\b/);
  });

  it("ждёт healthy у web, api и edge", () => {
    for (const svc of ["web", "api", "edge"]) {
      expect(DEPLOY, `деплой не ждёт healthy у ${svc}`).toMatch(new RegExp(`wait_healthy ${svc}\\b`));
    }
  });

  it("откат поднимает web api worker", () => {
    expect(DEPLOY).toMatch(/up -d --no-deps web api worker/);
    expect(DEPLOY).not.toMatch(/--no-deps app worker/);
  });
});
