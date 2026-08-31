import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BRAND_COLORS } from "@/lib/ui/brand-colors";
import { UI_TEXT } from "@/lib/ui/text";

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

  it("worker несёт hairpin-маппинг на host-gateway (пинг живости идёт по публичному домену)", () => {
    // WORKER-PING-HAIRPIN-01: healthcheck-ping.ts строит URL из NEXT_PUBLIC_APP_URL,
    // а публичный IP из контейнера через облачный NAT недостижим. Без маппинга
    // /api/health/worker всегда отвечает «воркер мёртв» при живом воркере.
    expect(serviceBlock("worker")!).toMatch(/^ {6}- "masterryadom\.ru:host-gateway"$/m);
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

/**
 * MAINTENANCE-PAGE-01 (2026-09-01) — страница «идут работы» появляется сама,
 * когда приложение не отвечает.
 *
 * Два механизма traefik, и оба обязаны быть на месте:
 *   1. fallback-роутер сервиса `maintenance` с приоритетом НИЖЕ web и api —
 *      когда их контейнеры остановлены, роутеры исчезают из traefik и трафик
 *      достаётся странице;
 *   2. errors-middleware на роутерах web (HTML) и api (JSON-конверт) — когда
 *      контейнер есть, но ещё не слушает или упал (502–504).
 * Сама страница — вне Next (nginx), поэтому её цвета и тексты — ЗЕРКАЛА
 * `brand-colors.ts` (UI-04) и `UI_TEXT.pages.maintenance`; зеркало расходится
 * молча, отсюда лок-степ ниже. Ориентир времени пишет деплой перед `up -d`.
 *
 * @probe 2026-09-01: priority maintenance `1` → `30` — красный («приоритет
 *   страницы работ обязан быть ниже web и api»); удалена строка
 *   `routers.api.middlewares` — красный; в HTML `#720808` → `#7c3aed` — красный
 *   (расхождение с brand-colors); текст `Идут работы` → `Идут работы!` — в
 *   первой редакции ЗЕЛЁНЫЙ (голый `toContain` — подстрока), проверка
 *   ужесточена до фрагментов с границами тегов, после чего — красный.
 */
describe("MAINTENANCE-PAGE-01 · страница работ поднимается сама", () => {
  const maintenance = serviceBlock("maintenance");
  const HTML = readFileSync(resolve(ROOT, "deploy/maintenance/index.html"), "utf8");
  const NGINX = readFileSync(resolve(ROOT, "deploy/maintenance/nginx.conf"), "utf8");

  it("сервис maintenance: fallback-роутер с приоритетом ниже web и api, TLS, порт 80", () => {
    expect(maintenance, "нет сервиса maintenance").toBeTruthy();
    const l = labelsOf(maintenance!);
    const web = labelsOf(serviceBlock("web")!);
    const api = labelsOf(serviceBlock("api")!);
    const prio = Number(l["traefik.http.routers.maintenance.priority"]);
    expect(Number.isFinite(prio)).toBe(true);
    expect(prio, "приоритет страницы работ обязан быть ниже web и api").toBeLessThan(
      Math.min(Number(web["traefik.http.routers.web.priority"]), Number(api["traefik.http.routers.api.priority"])),
    );
    expect(l["traefik.http.routers.maintenance.rule"]).toBe("Host(`masterryadom.ru`)");
    expect(l["traefik.http.routers.maintenance.entrypoints"]).toBe("websecure");
    expect(l["traefik.http.routers.maintenance.tls.certresolver"]).toBe("letsencrypt");
    expect(l["traefik.http.services.maintenance.loadbalancer.server.port"]).toBe("80");
    expect(maintenance!).toMatch(/\.\/deploy\/maintenance\/index\.html:\/usr\/share\/nginx\/html\/index\.html:ro/);
    expect(maintenance!).toMatch(/\.\/deploy\/maintenance\/nginx\.conf:\/etc\/nginx\/conf\.d\/default\.conf:ro/);
    expect(maintenance!).toMatch(/\.\/\.maintenance-state:\/usr\/share\/nginx\/html\/state:ro/);
  });

  it("errors-middleware: web → HTML, api → JSON, оба на 502–504 из сервиса maintenance", () => {
    const l = labelsOf(maintenance!);
    for (const name of ["maintenance-html", "maintenance-json"]) {
      expect(l[`traefik.http.middlewares.${name}.errors.status`]).toBe("502-504");
      expect(l[`traefik.http.middlewares.${name}.errors.service`]).toBe("maintenance");
    }
    expect(l["traefik.http.middlewares.maintenance-html.errors.query"]).toBe("/index.html");
    expect(l["traefik.http.middlewares.maintenance-json.errors.query"]).toBe("/api/maintenance");
    expect(labelsOf(serviceBlock("web")!)["traefik.http.routers.web.middlewares"]).toBe("maintenance-html");
    expect(labelsOf(serviceBlock("api")!)["traefik.http.routers.api.middlewares"]).toBe("maintenance-json");
  });

  it("nginx: страница — 503 + Retry-After, /api/* — JSON-конверт 503, ориентир из /state/", () => {
    expect(NGINX).toMatch(/error_page 503 \/index\.html;/);
    expect(NGINX).toMatch(/location \/ \{\s*return 503;\s*\}/);
    expect(NGINX).toMatch(/Retry-After/);
    expect(NGINX).toMatch(/location = \/api\/maintenance \{[\s\S]*?return 503 '\{"ok":false,"error":\{"code":"MAINTENANCE"/);
    expect(NGINX).toMatch(/location \^~ \/api\/ \{[\s\S]*?return 503 '\{"ok":false/);
    expect(NGINX).toMatch(/location \^~ \/state\/ \{[\s\S]*?no-store/);
    expect(NGINX).toContain(UI_TEXT.pages.maintenance.apiMessage);
  });

  it("HTML зеркалит UI_TEXT.pages.maintenance — тексты в одном месте, точной разметкой", () => {
    const t = UI_TEXT.pages.maintenance;
    // Границы тегов обязательны: голый `toContain(строка)` пропускал «Идут работы!»
    // (проба P4 первой редакции была зелёной на дрейфе).
    const fragments = [
      `<h1>${t.title.replace(" приложение", " <em>приложение</em>")}</h1>`,
      `<span>${t.status}</span>`,
      `<p>${t.subtitle}</p>`,
      `>${t.etaUnknown}</div>`,
      `"${t.etaUntilPrefix} <strong>"`,
      `"</strong> ${t.etaUntilSuffix}"`,
      `>${t.reload}</button>`,
      `${t.contactPrefix} <a href="mailto:support@masterryadom.ru">`,
    ];
    for (const f of fragments) {
      expect(HTML, `в HTML нет фрагмента: ${f}`).toContain(f);
    }
  });

  it("HTML зеркалит brand-colors (UI-04): бренд-градиент и обе поверхности", () => {
    const c = BRAND_COLORS;
    for (const hex of [c.brandFrom, c.brandVia, c.brandDeep, c.brandAccent, c.surfacePage, c.surfaceCard, c.textMain, c.textSecondary, c.borderSubtle, c.darkSurfacePage, c.darkSurfaceCard, c.darkTextMain, c.darkTextSecondary, c.darkBorderSubtle]) {
      expect(HTML, `в HTML нет цвета ${hex} из brand-colors.ts`).toContain(hex);
    }
    // Чужой палитре здесь не место — прежний фиолетово-розовый набор (UI-04).
    expect(HTML).not.toMatch(/#7c3aed|#ec4899/i);
    // Тёмная тема — через prefers-color-scheme, а не отдельная страница.
    expect(HTML).toMatch(/@media \(prefers-color-scheme: dark\)/);
    // Никаких внешних ресурсов: страница обязана работать, когда лежит всё.
    expect(HTML).not.toMatch(/<link[^>]+href="https?:/);
    expect(HTML).not.toMatch(/<script[^>]+src=/);
  });

  it("deploy.yml пишет ориентир перед up -d и снимает после успеха и при откате", () => {
    const script = DEPLOY.slice(DEPLOY.indexOf("script: |"));
    const etaAt = script.indexOf("> '$ETA_FILE'");
    const upAt = script.indexOf("up -d --remove-orphans");
    expect(etaAt, "нет записи eta.json").toBeGreaterThan(-1);
    expect(etaAt).toBeLessThan(upAt);
    expect(script).toMatch(/rollback_and_fail\(\) \{\n[^\n]*\n\s+clear_eta/);
    const successAt = script.indexOf("✅ Деплой $DEPLOY_SHA успешен");
    const clearAt = script.lastIndexOf("clear_eta", successAt);
    expect(clearAt).toBeGreaterThan(upAt);
  });
});

/**
 * AUTO-DEPLOY-01 (2026-09-01) — деплой по зелёному CI на main, снимок БД
 * перед миграциями, уведомления.
 *
 * Что сторожится:
 *   1. Триггер — `workflow_run` по workflow `CI` на `main`, и preflight гейтится
 *      `conclusion == 'success'`: красный CI не должен доходить даже до
 *      «пропущенного» деплоя, иначе каждый провал CI рисовал бы деплой в истории.
 *   2. Снимок БД стоит СТРОГО до миграций и проверяется чтением
 *      (`pg_restore --list`): миграции откатом не отменяются, а при автодеплое
 *      рядом нет человека со снимком.
 *   3. Страховка «деплоим тот SHA, что прошёл CI» есть с обеих сторон: job guard
 *      (API) и скрипт на ВМ после pull.
 *   4. Скрипт на ВМ исполняет dash — башизмы вида `${VAR:0:8}` / `[[` тихо
 *      ломают его на стенде, а в CI-раннере (bash) прошли бы.
 *   5. notify — всегда, оба канала, без сторонних экшенов для Telegram.
 *
 * @probe 2026-09-01: `conclusion == 'success'` → `'failure'` — красный;
 *   перестановка шага snapshot ниже migrate — красный («снимок идёт после
 *   миграций»); `${DEPLOY_SHA}` → `${DEPLOY_SHA:0:8}` в имени снимка (внутри
 *   скрипта ВМ) — красный. ⚠️ Тот же башизм в `run:`-шаге job notify зелёный
 *   НАМЕРЕННО: там bash раннера GitHub, проверка сужена до скрипта ВМ — первая
 *   проба била мимо области и это выяснилось ровно так.
 */
describe("AUTO-DEPLOY-01 · deploy.yml: автозапуск по CI, снимок БД, уведомления", () => {
  it("автозапуск — workflow_run по CI на main, только на зелёном результате", () => {
    expect(DEPLOY).toMatch(/workflow_run:\n\s+workflows: \["CI"\]\n\s+types: \[completed\]\n\s+branches: \[main\]/);
    expect(DEPLOY).toMatch(/github\.event\.workflow_run\.conclusion == 'success'/);
    // Ручной запуск сохранён — повторы и откат вперёд.
    expect(DEPLOY).toMatch(/workflow_dispatch:/);
  });

  it("снимок БД — до миграций, читается pg_restore, с ретенцией", () => {
    // Порядок судится по СКРИПТУ на ВМ, а не по всему файлу: шапка-комментарий
    // упоминает команду миграции раньше любого шага.
    const script = DEPLOY.slice(DEPLOY.indexOf("script: |"));
    const snapshotAt = script.indexOf("pg_dump --format=custom");
    const migrateAt = script.indexOf("--profile db run --rm --no-deps migrate");
    const upAt = script.indexOf("up -d --remove-orphans");
    expect(snapshotAt, "нет шага pg_dump").toBeGreaterThan(-1);
    expect(snapshotAt, "снимок идёт после миграций").toBeLessThan(migrateAt);
    expect(migrateAt).toBeLessThan(upAt);
    expect(script).toMatch(/pg_restore --list/);
    expect(script).toMatch(/tail -n \+\$\(\(BACKUP_KEEP \+ 1\)\)/);
    // DATABASE_URL Prisma несёт ?schema=public — libpq такого параметра не знает.
    expect(script).toMatch(/DB_URL="\$\{DB_URL%%\\\?\*\}"/);
  });

  it("деплоится ровно тот SHA, что прошёл CI — проверка в job guard И на ВМ после pull", () => {
    expect(DEPLOY).toMatch(/branches\/main" --jq \.commit\.sha/);
    expect(DEPLOY).toMatch(/skip=true/);
    expect(DEPLOY).toMatch(/rev-parse HEAD\)" != "\$EXPECTED_SHA"/);
  });

  it("скрипт для ВМ — POSIX sh: без башизмов (login-shell деплой-пользователя — dash)", () => {
    const scriptStart = DEPLOY.indexOf("script: |");
    const scriptEnd = DEPLOY.indexOf("\n  notify:");
    const script = DEPLOY.slice(scriptStart, scriptEnd);
    expect(script).not.toMatch(/\$\{[A-Za-z_]+:\d+:\d+\}/);
    expect(script).not.toMatch(/\[\[ /);
    expect(script).not.toMatch(/set -o pipefail/);
    expect(script).not.toMatch(/\blocal\b/);
  });

  it("уведомления — всегда, Telegram через Bot API и письмо через SMTP", () => {
    const notifyAt = DEPLOY.indexOf("\n  notify:");
    expect(notifyAt).toBeGreaterThan(-1);
    const notify = DEPLOY.slice(notifyAt);
    expect(notify).toMatch(/if: always\(\)/);
    expect(notify).toMatch(/api\.telegram\.org\/bot\$\{TG_BOT_TOKEN\}\/sendMessage/);
    expect(notify).toMatch(/dawidd6\/action-send-mail@v3/);
    expect(notify).toMatch(/server_address: smtp\.yandex\.ru/);
    expect(notify).toMatch(/secure: true/);
  });
});
