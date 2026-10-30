import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";
import type { AlertLevel } from "@/lib/monitoring/alert";
import { peekRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

/**
 * ALERT-EMAIL-CHANNEL — тот же ops-алерт ещё и письмом на ящик команды
 * (`MONITORING_ALERT_EMAIL_TO`), рядом с Telegram.
 *
 * 🔴 Письмо уходит с ОБЩЕГО SMTP-ящика — того же, что шлёт коды входа (в
 * проде это единственный включённый канал входа), приглашения и уведомления.
 * У почтового сервиса есть суточный предел отправки на ящик, и шторм ошибок,
 * превращённый в шторм писем, выбрал бы его: коды перестали бы доходить, и
 * войти не смог бы никто. Пауза по ключу события (`alert-cooldown.ts`) от этого
 * не защищает — разных событий бывает много. Поэтому у писем свой потолок на
 * все процессы вместе (web, api, воркер): общий счётчик в Redis, без Redis —
 * счётчик процесса.
 *
 * Предупреждения (`warning`) берут только часть потолка, чтобы остаток всегда
 * доставался ошибкам. Последнее письмо перед потолком говорит об этом — иначе
 * тишина в ящике читалась бы как «всё хорошо»; Telegram и лог при этом
 * получают всё, как раньше.
 *
 * Отправка не через очередь: алерт бывает о самом воркере.
 */
export const ALERT_EMAIL_BUDGET = {
  /** Писем-алертов в час (UTC) — на все процессы вместе. */
  hourly: 12,
  /** Писем-алертов в сутки (UTC). */
  daily: 60,
  /** Предупреждение письмом уходит, только пока писем меньше этой отметки за час… */
  warningHourly: 6,
  /** …и за сутки: остальное держится для ошибок. */
  warningDaily: 30,
} as const;

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const BUDGET_KEY_PREFIX = "mon:alert:email:";

/**
 * Проверка и списание одним скриптом: два процесса не превысят потолок вдвоём,
 * а отказ не тратит место (иначе поток предупреждений съел бы бюджет ошибок).
 * Срок ключа ставится и досылается внутри скрипта — потерянной EXPIRE нет.
 */
const TAKE_BUDGET_SCRIPT = `
local hourly = tonumber(redis.call('GET', KEYS[1]) or '0')
local daily = tonumber(redis.call('GET', KEYS[2]) or '0')
if hourly >= tonumber(ARGV[1]) or daily >= tonumber(ARGV[2]) then
  return {0, hourly, daily}
end
hourly = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
daily = redis.call('INCR', KEYS[2])
if redis.call('PTTL', KEYS[2]) < 0 then redis.call('PEXPIRE', KEYS[2], ARGV[4]) end
return {1, hourly, daily}
`;

type BudgetDecision = { allowed: boolean; hourly: number; daily: number };

/** Счётчик процесса — когда общего нет (скрипт без Redis, Redis лежит). */
const local = { hourIndex: -1, dayIndex: -1, hourly: 0, daily: 0 };

function limitsFor(level: AlertLevel): { hourly: number; daily: number } {
  return level === "warning"
    ? { hourly: ALERT_EMAIL_BUDGET.warningHourly, daily: ALERT_EMAIL_BUDGET.warningDaily }
    : { hourly: ALERT_EMAIL_BUDGET.hourly, daily: ALERT_EMAIL_BUDGET.daily };
}

function takeLocalBudget(limits: { hourly: number; daily: number }, now: number): BudgetDecision {
  const hourIndex = Math.floor(now / HOUR_MS);
  const dayIndex = Math.floor(now / DAY_MS);
  if (local.hourIndex !== hourIndex) {
    local.hourIndex = hourIndex;
    local.hourly = 0;
  }
  if (local.dayIndex !== dayIndex) {
    local.dayIndex = dayIndex;
    local.daily = 0;
  }
  if (local.hourly >= limits.hourly || local.daily >= limits.daily) {
    return { allowed: false, hourly: local.hourly, daily: local.daily };
  }
  local.hourly += 1;
  local.daily += 1;
  return { allowed: true, hourly: local.hourly, daily: local.daily };
}

function parseDecision(reply: unknown): BudgetDecision | null {
  if (!Array.isArray(reply) || reply.length < 3) return null;
  const [allowed, hourly, daily] = reply.map((item) => Number(item));
  if (![allowed, hourly, daily].every(Number.isFinite)) return null;
  return { allowed: allowed === 1, hourly, daily };
}

async function takeSharedBudget(
  limits: { hourly: number; daily: number },
  now: number,
): Promise<BudgetDecision | null> {
  // Только уже открытое соединение: алерт не открывает Redis в скрипте,
  // которому он не нужен (как пауза алертов из `logError`).
  const pending = peekRedisConnection();
  if (!pending) return null;
  const client = await pending;
  if (!client) return null;
  const hourIndex = Math.floor(now / HOUR_MS);
  const dayIndex = Math.floor(now / DAY_MS);
  const reply = await withRedisCommandTimeout(
    "monitoring:alerts:email-budget",
    client.eval(TAKE_BUDGET_SCRIPT, {
      keys: [`${BUDGET_KEY_PREFIX}h:${hourIndex}`, `${BUDGET_KEY_PREFIX}d:${dayIndex}`],
      arguments: [String(limits.hourly), String(limits.daily), String(2 * HOUR_MS), String(2 * DAY_MS)],
    }),
  );
  return parseDecision(reply);
}

/** Можно ли отправить письмо-алерт этого уровня сейчас. Не бросает. */
export async function takeAlertEmailBudget(level: AlertLevel, now = Date.now()): Promise<BudgetDecision> {
  const limits = limitsFor(level);
  try {
    const shared = await takeSharedBudget(limits, now);
    if (shared) return shared;
  } catch {
    // Redis не ответил — считает процесс. Шум в лог не нужен: отказ Redis
    // виден по его собственным алертам.
  }
  return takeLocalBudget(limits, now);
}

/** Строка в конце письма, исчерпавшего потолок, — иначе тишина читается как «всё хорошо». */
export function budgetExhaustedNotice(level: AlertLevel, decision: BudgetDecision): string | null {
  const limits = limitsFor(level);
  const what = level === "warning" ? "Предупреждений письмом" : "Писем-алертов";
  if (decision.daily >= limits.daily) {
    return `${what} больше не будет до конца суток (UTC): потолок ${limits.daily}. Остальное — в Telegram и в логе.`;
  }
  if (decision.hourly >= limits.hourly) {
    return `${what} больше не будет до конца часа: потолок ${limits.hourly}. Остальное — в Telegram и в логе.`;
  }
  return null;
}

/**
 * Адресаты через запятую. Разбор свой, а не `splitEnvList`: тесты подменяют
 * модуль `env` одним объектом, и обращение к его функции бросило бы внутри
 * алерта (формат адресов проверяет схема `env.ts` на старте).
 */
export function alertEmailRecipients(): string[] {
  const raw = env.MONITORING_ALERT_EMAIL_TO ?? "";
  return Array.from(new Set(raw.split(",").map((item) => item.trim()).filter(Boolean)));
}

/**
 * Канал включён, когда есть адресаты и SMTP. Считается по `env`, а не через
 * `email/sender.ts`: тот импортирует логгер, а логгер — алерты (цикл).
 */
export function isAlertEmailConfigured(): boolean {
  return alertEmailRecipients().length > 0 && Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type AlertEmailOutcome = "sent" | "budget" | "not-configured" | "failed";

/**
 * Письмо-алерт. Тело собирает `sendAlert` (`alert.ts`) из тех же разрешённых и
 * очищенных строк, что и сообщение Telegram. Не бросает; отказ пишется в лог
 * с `__skipAlert` — алерт об отказе алерта зациклил бы канал.
 */
export async function sendAlertEmail(input: {
  level: AlertLevel;
  subject: string;
  text: string;
}): Promise<AlertEmailOutcome> {
  if (!isAlertEmailConfigured()) return "not-configured";
  const decision = await takeAlertEmailBudget(input.level);
  if (!decision.allowed) return "budget";

  const notice = budgetExhaustedNotice(input.level, decision);
  const text = notice ? `${input.text}\n\n${notice}` : input.text;
  try {
    // Динамически: `email/sender.ts` → логгер → алерты — цикл при загрузке.
    const { trySendEmail } = await import("@/lib/email/sender");
    const result = await trySendEmail({
      to: alertEmailRecipients().join(", "),
      // Перевод строки в теме — повод для чужого заголовка; тема — одна строка.
      subject: input.subject.replace(/\s+/g, " ").trim(),
      text,
      html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    });
    if (result.status === "sent") return "sent";
    logError("Alert email not sent", {
      level: input.level,
      outcome: result.status,
      ...(result.status === "failed"
        ? { alertError: result.error instanceof Error ? result.error.message : String(result.error) }
        : {}),
      __skipAlert: true,
    });
    return result.status === "failed" ? "failed" : "not-configured";
  } catch (error) {
    logError("Alert email not sent", {
      level: input.level,
      outcome: "failed",
      alertError: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
    return "failed";
  }
}

/** Только для тестов: сбросить счётчик процесса. */
export function resetAlertEmailBudgetForTests(): void {
  local.hourIndex = -1;
  local.dayIndex = -1;
  local.hourly = 0;
  local.daily = 0;
}
