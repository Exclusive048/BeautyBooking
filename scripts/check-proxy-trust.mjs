#!/usr/bin/env node
/**
 * check-proxy-trust.mjs — однокомандная проверка `TRUSTED_PROXY_HOPS`
 * (DEPLOY-BACKLOG §B.3.1 / §2.1 шаги 1–4; чеклист — шаг 3.1).
 *
 * Что делает: снимает диагностику `GET /api/admin/diagnostics/client-ip`
 * дважды — чистым запросом и с ПОДСТАВЛЕННЫМ `X-Forwarded-For` — и сверяет
 * итог с независимо взятым egress-IP машины. Четыре проверки:
 *   1. `resolvedIp` совпадает с настоящим адресом (ipify);
 *   2. `clamped: false` — хопов не больше реальной топологии;
 *   3. `resolvedIsPrivate: false` — не разрешили запрос в собственную инфраструктуру;
 *   4. подставленный XFF НЕ потребляется (иначе per-IP лимиты обходимы).
 *
 * Запуск (с РАБОЧЕЙ машины, через публичный домен — не с ВМ и не через
 * `--resolve` на loopback: оба запроса должны пройти настоящий edge с одного
 * egress-IP):
 *
 *   node scripts/check-proxy-trust.mjs --cookie "<значение bh_session>"
 *   node scripts/check-proxy-trust.mjs --base https://masterryadom.ru --cookie "bh_session=…"
 *
 * Куку берём из браузера после входа админом: DevTools → Application →
 * Cookies → `bh_session` (роут admin-only). Можно передать через env
 * `PROXY_TRUST_COOKIE` вместо флага. Скрипт ничего не меняет — два GET.
 *
 * Exit-коды: 0 = PASS · 1 = FAIL (значение чинить по таблице §2.1 шаг 3) ·
 * 2 = не смогли проверить (кука/сеть/аргументы) — это НЕ «прошло».
 */

const SPOOF_IP = "203.0.113.77"; // TEST-NET-3 — в реальном трафике не встречается
const TIMEOUT_MS = 15_000;

function parseArgs(argv) {
  const args = { base: "https://masterryadom.ru", cookie: process.env.PROXY_TRUST_COOKIE ?? null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--base" && argv[i + 1]) args.base = argv[++i];
    else if (argv[i] === "--cookie" && argv[i + 1]) args.cookie = argv[++i];
    else {
      console.error(`Неизвестный аргумент: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.cookie) {
    console.error(
      "Нужна админ-кука: --cookie \"<значение bh_session>\" либо env PROXY_TRUST_COOKIE.\n" +
        "Взять из браузера после входа админом: DevTools → Application → Cookies → bh_session."
    );
    process.exit(2);
  }
  if (!args.cookie.includes("=")) args.cookie = `bh_session=${args.cookie}`;
  args.base = args.base.replace(/\/+$/u, "");
  return args;
}

async function fetchText(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
  const text = await res.text();
  return { status: res.status, text };
}

/** Независимый egress-IP. v4-сервис первым: у продукта per-IP ключи в основном v4. */
async function independentIp() {
  for (const url of ["https://api.ipify.org", "https://api64.ipify.org"]) {
    try {
      const { status, text } = await fetchText(url);
      const ip = text.trim();
      if (status === 200 && ip.length > 0 && ip.length < 64) return ip;
    } catch {
      // пробуем следующий
    }
  }
  console.error("Не удалось взять независимый IP (ipify недоступен) — проверка не выполнена.");
  process.exit(2);
}

/** `::ffff:1.2.3.4` и голый `1.2.3.4` — один адрес. */
function normalizeIp(value) {
  if (!value) return value;
  const mapped = value.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u);
  return mapped ? mapped[1] : value.toLowerCase();
}

async function diagnostics(base, cookie, extraHeaders = {}) {
  const url = `${base}/api/admin/diagnostics/client-ip`;
  let payload;
  try {
    payload = await fetchText(url, { headers: { cookie, ...extraHeaders } });
  } catch (error) {
    console.error(`Запрос ${url} не прошёл: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
  if (payload.status === 401 || payload.status === 403) {
    console.error(
      `Диагностика ответила ${payload.status} — кука не админская или протухла (access-токен живёт 2 ч). ` +
        "Перелогиньтесь админом и возьмите свежую bh_session."
    );
    process.exit(2);
  }
  let json;
  try {
    json = JSON.parse(payload.text);
  } catch {
    console.error(`Диагностика ответила не-JSON (HTTP ${payload.status}) — до роута не дошли (редирект/edge?).`);
    process.exit(2);
  }
  if (!json?.ok || !json.data) {
    console.error(`Неожиданный конверт ответа: ${payload.text.slice(0, 300)}`);
    process.exit(2);
  }
  return json.data;
}

const args = parseArgs(process.argv);

const realIp = await independentIp();
const clean = await diagnostics(args.base, args.cookie);
const spoofed = await diagnostics(args.base, args.cookie, { "x-forwarded-for": SPOOF_IP });

console.log(`Стенд:            ${args.base}`);
console.log(`Независимый IP:   ${realIp}`);
console.log(
  `Диагностика:      resolvedIp=${clean.resolvedIp} source=${clean.source} ` +
    `configuredHops=${clean.configuredHops} effectiveHops=${clean.effectiveHops}`
);
console.log(`Цепочка XFF:      ${clean.chain.length ? clean.chain.join(" → ") : "(пусто)"}`);
console.log("");

const checks = [];
const resolved = normalizeIp(clean.resolvedIp);

const ipMatches = resolved === normalizeIp(realIp);
checks.push([
  ipMatches,
  `resolvedIp совпадает с независимым адресом`,
  ipMatches
    ? null
    : `${clean.resolvedIp} ≠ ${realIp} — число хопов не совпадает с топологией (разбор: DEPLOY-BACKLOG §2.1 шаг 3).` +
      (String(resolved).includes(":") !== String(realIp).includes(":")
        ? " ⚠️ Похоже на v4/v6-расхождение стека — повторите с той же семьёй адресов, прежде чем крутить хопы."
        : ""),
]);

checks.push([
  clean.clamped === false,
  "clamped: false — снятие хопов не упёрлось в левый край",
  clean.clamped ? "цепочка короче настроенных хопов ⇒ значение ВЫШЕ реальной топологии — понизить." : null,
]);

checks.push([
  clean.resolvedIsPrivate === false,
  "resolvedIsPrivate: false — итог не из собственной инфраструктуры",
  clean.resolvedIsPrivate
    ? "разрешили адрес прокси/сети ⇒ значение НИЖЕ реальной топологии — все лимиты схлопнутся в один IP."
    : null,
]);

const spoofResolved = normalizeIp(spoofed.resolvedIp);
const spoofRejected = spoofResolved !== SPOOF_IP && spoofResolved === resolved;
checks.push([
  spoofRejected,
  "подставленный X-Forwarded-For не потребляется (контрольная проба §2.1 шаг 4)",
  spoofRejected
    ? null
    : spoofResolved === SPOOF_IP
      ? `вернулся ПОДСТАВЛЕННЫЙ ${SPOOF_IP} ⇒ per-IP лимитов у продукта фактически нет — значение слишком высокое.`
      : `итог сдвинулся (${clean.resolvedIp} → ${spoofed.resolvedIp}) — edge смешивает клиентский XFF со своим, разбирать топологию.`,
]);

let failed = 0;
for (const [okCheck, title, detail] of checks) {
  console.log(`${okCheck ? "✅" : "❌"} ${title}`);
  if (!okCheck && detail) console.log(`   ${detail}`);
  if (!okCheck) failed++;
}

console.log("");
if (failed === 0) {
  console.log(
    `PASS — TRUSTED_PROXY_HOPS соответствует топологии (effectiveHops=${clean.effectiveHops}). ` +
      "Запишите дату и chain комментарием в .env.production (§2.1 шаг 5); повторять после каждого изменения edge."
  );
} else {
  console.log(`FAIL — ${failed} из ${checks.length} проверок не прошли. Разбор значений: DEPLOY-BACKLOG §2.1 шаг 3.`);
  process.exitCode = 1;
}
