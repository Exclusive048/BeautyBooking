import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * APP-TIER-SPLIT-02 (2026-08-31) — ярус приложения в проде: один образ, два
 * контейнера (`web` — страницы, `api` — `/api/*`) за traefik из того же compose.
 * Сверено с боевым стендом: `/opt/app`, traefik терминирует TLS (LE), Postgres
 * на отдельном хосте (профиль `db`).
 *
 * Что здесь сторожится и почему это не «форма конфига ради формы»:
 *
 * 1. **Маршруты.** Роутер api обязан забирать `/api` и `/api/*` и стоять ВЫШЕ
 *    роутера web по приоритету — иначе весь API молча уедет в web (тот же
 *    образ, поэтому «работает», но разделение становится фикцией).
 * 2. **Трастовая модель клиентского IP.** traefik — единственный доверенный
 *    хоп (`TRUSTED_PROXY_HOPS=1`), и это верно ровно потому, что он НЕ доверяет
 *    входящим X-Forwarded-* (`forwardedHeaders.insecure` выключен). Порт 3000
 *    публикуется ТОЛЬКО на loopback и только у api (host-cron, пробы деплоя):
 *    запрос мимо traefik приходит без доверенного XFF.
 * 3. **Секрет вебхука не в access-log.** `RequestPath` traefik содержит
 *    query-строку, а в `?token=` едет секрет ЮКассы — access-log либо выключен,
 *    либо роняет поле.
 * 4. **Паритет web/api.** Оба — один `node server.js`; разойдись их
 *    runtime-блоки (env_file, grace, healthcheck) — половина трафика жила бы по
 *    другим правилам.
 * 5. **deploy.yml согласован**: `/opt/app`, собирает `web` (api берёт тот же
 *    тег), миграция `--no-deps` (postgres на другом хосте), ждёт healthy у web
 *    и api, откатывает `web api worker`, на `app`/`edge` не ссылается.
 *
 * @probe 2026-08-31 — сторож доведён пробами по правилу #43:
 *   • `priority=20` у api → `5` — красный: «api должен стоять выше web»;
 *   • `PathPrefix(\`/api/\`)` → `PathPrefix(\`/apx/\`)` — красный: «роутер api
 *     не покрывает /api/»;
 *   • `ports:` api → `"3000:3000"` — красный: «порт 3000 опубликован не на loopback»;
 *   • добавлен `--accesslog=true` в traefik — красный: «access-log traefik
 *     включён без drop RequestPath»;
 *   • `up -d --no-deps web api worker` → `app worker` в deploy.yml — красный.
 */

const ROOT = process.cwd();
const COMPOSE = readFileSync(resolve(ROOT, "docker-compose.prod.yml"), "utf8");
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

/** Строки-значения списка `ports:` сервиса (без комментариев). */
function portsOf(block: string): string[] {
  const m = block.match(/^ {4}ports:\n((?: {6}- [^\n]*\n)+)/m);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^ {6}- /, "").trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

/** traefik-метки сервиса как { key: value }. */
function labelsOf(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const m = block.match(/^ {4}labels:\n((?: {6}(?:- [^\n]*|#[^\n]*)\n)+)/m);
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^ {6}- "([^=]+)=(.*)"$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

/** Строки `command:` сервиса traefik (флаги CLI). */
function traefikFlags(block: string): string[] {
  const m = block.match(/^ {4}command:\n((?: {6}(?:- [^\n]*|#[^\n]*)\n)+)/m);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.match(/^ {6}- "([^"]+)"$/)?.[1] ?? "")
    .filter(Boolean);
}

const traefik = serviceBlock("traefik");
const web = serviceBlock("web");
const api = serviceBlock("api");
const worker = serviceBlock("worker");

describe("APP-TIER-SPLIT-02 · compose: один образ, web + api за traefik", () => {
  it("сервисы traefik / web / api / worker / redis / postgres / migrate есть; app и edge — нет", () => {
    for (const name of ["traefik", "web", "api", "worker", "redis", "postgres", "migrate"]) {
      expect(serviceBlock(name), `нет сервиса ${name}`).toBeTruthy();
    }
    expect(serviceBlock("app"), "монолитный app должен быть разведён на web/api").toBeNull();
    expect(serviceBlock("edge"), "nginx-edge снят: маршрутизирует traefik").toBeNull();
  });

  it("web и api берут ОДИН образ, build: объявлен только у web; оба в профиле app", () => {
    expect(web!).toMatch(/^ {4}image: beautyhub-app:latest$/m);
    expect(api!).toMatch(/^ {4}image: beautyhub-app:latest$/m);
    expect(hasServiceKey(web!, "build")).toBe(true);
    expect(hasServiceKey(api!, "build"), "api не должен собирать образ второй раз").toBe(false);
    expect(web!).toMatch(/^ {4}profiles: \["app"\]$/m);
    expect(api!).toMatch(/^ {4}profiles: \["app"\]$/m);
  });

  it("postgres и migrate — профиль db (БД на отдельном хосте), web/api/worker не требуют их жёстко", () => {
    expect(serviceBlock("postgres")!).toMatch(/^ {4}profiles: \["db"\]$/m);
    expect(serviceBlock("migrate")!).toMatch(/^ {4}profiles: \["db"\]$/m);
    for (const [name, block] of Object.entries({ web, api, worker })) {
      const dep = block!.match(/^ {6}postgres:\n((?: {8}[^\n]*\n)+)/m)?.[1] ?? "";
      expect(dep, `${name}: depends_on.postgres без required: false сломает --profile app`).toMatch(
        /required: false/,
      );
    }
  });

  it("порты наружу — только у traefik (80/443); 3000 — только у api и только на loopback", () => {
    expect(portsOf(traefik!).sort()).toEqual(["443:443", "80:80"]);
    expect(portsOf(web!), "web не должен публиковать порт: страницы ходят через traefik").toEqual([]);
    expect(portsOf(worker!)).toEqual([]);
    const apiPorts = portsOf(api!);
    expect(apiPorts).toEqual(["127.0.0.1:3000:3000"]);
    for (const p of apiPorts) {
      expect(p.startsWith("127.0.0.1:"), `порт 3000 опубликован не на loopback: ${p}`).toBe(true);
    }
  });

  it("роутер api покрывает /api и /api/* и стоит выше роутера web", () => {
    const a = labelsOf(api!);
    const w = labelsOf(web!);
    expect(a["traefik.enable"]).toBe("true");
    expect(w["traefik.enable"]).toBe("true");
    const rule = a["traefik.http.routers.api.rule"] ?? "";
    expect(rule, "роутер api не покрывает /api/").toContain("PathPrefix(`/api/`)");
    expect(rule, "роутер api не покрывает точный /api").toContain("Path(`/api`)");
    expect(rule).toContain("Host(`masterryadom.ru`)");
    expect(w["traefik.http.routers.web.rule"]).toBe("Host(`masterryadom.ru`)");
    const apiPrio = Number(a["traefik.http.routers.api.priority"]);
    const webPrio = Number(w["traefik.http.routers.web.priority"]);
    expect(Number.isFinite(apiPrio) && Number.isFinite(webPrio)).toBe(true);
    expect(apiPrio, "api должен стоять выше web, иначе /api/* уедет в web").toBeGreaterThan(webPrio);
  });

  it("оба роутера — только websecure + TLS через letsencrypt, сервисы смотрят на порт 3000", () => {
    for (const [name, block] of Object.entries({ web, api })) {
      const l = labelsOf(block!);
      expect(l[`traefik.http.routers.${name}.entrypoints`]).toBe("websecure");
      expect(l[`traefik.http.routers.${name}.tls`]).toBe("true");
      expect(l[`traefik.http.routers.${name}.tls.certresolver`]).toBe("letsencrypt");
      expect(l[`traefik.http.routers.${name}.service`]).toBe(name);
      expect(l[`traefik.http.services.${name}.loadbalancer.server.port`]).toBe("3000");
    }
  });

  it("traefik: exposedbydefault=false, клиентскому XFF не доверяет, access-log не течёт query-строкой", () => {
    const flags = traefikFlags(traefik!);
    expect(flags).toContain("--providers.docker.exposedbydefault=false");
    expect(
      flags.some((f) => /forwardedheaders\.insecure=true/i.test(f)),
      "forwardedHeaders.insecure=true доверяет клиентскому X-Forwarded-For — обход per-IP лимитов",
    ).toBe(false);
    const accessLogOn = flags.some((f) => /^--accesslog(=true)?$/.test(f));
    const dropsPath = flags.some((f) => /^--accesslog\.fields\.names\.RequestPath=drop$/.test(f));
    expect(
      !accessLogOn || dropsPath,
      "access-log traefik включён без drop RequestPath — в него уедет ?token= вебхука ЮКассы",
    ).toBe(true);
    // http→https и LE на :80 — иначе сертификат не выпустится / http останется открытым.
    expect(flags).toContain("--entrypoints.web.http.redirections.entrypoint.to=websecure");
    expect(flags).toContain("--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web");
  });

  it("runtime-блоки web и api зеркальны: env_file, stop_grace_period, restart, depends_on, healthcheck, networks", () => {
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

describe("APP-TIER-SPLIT-02 · deploy.yml согласован с топологией", () => {
  it("каталог стенда /opt/app, профиль app, миграция --no-deps (postgres на другом хосте)", () => {
    expect(DEPLOY).toMatch(/APP_DIR="\/opt\/app"/);
    expect(DEPLOY).not.toContain("/opt/masterryadom");
    expect(DEPLOY).toMatch(/--profile app/);
    expect(DEPLOY).toMatch(/--profile db run --rm --no-deps migrate/);
  });

  it("собирает web (api берёт тот же тег) и не ссылается на app/edge", () => {
    expect(DEPLOY).toMatch(/\$COMPOSE build web/);
    expect(DEPLOY).not.toMatch(/\$COMPOSE build app\b/);
    expect(DEPLOY).not.toMatch(/ps -q app\b/);
    expect(DEPLOY).not.toMatch(/wait_healthy edge\b/);
  });

  it("ждёт healthy у web и api, проверяет readiness у обеих половин", () => {
    for (const svc of ["web", "api"]) {
      expect(DEPLOY, `деплой не ждёт healthy у ${svc}`).toMatch(new RegExp(`wait_healthy ${svc}\\b`));
    }
    expect(DEPLOY).toMatch(/for svc in web api; do/);
  });

  it("откат поднимает web api worker", () => {
    expect(DEPLOY).toMatch(/up -d --no-deps web api worker/);
    expect(DEPLOY).not.toMatch(/--no-deps app worker/);
  });
});
