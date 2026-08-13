import { createHash } from "crypto";

import { isProduction } from "@/lib/env";
import { resolveClientIpDiagnostics, type HeaderCarrier } from "@/lib/http/ip";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";

/**
 * FIX-B17 — детектор неверного `TRUSTED_PROXY_HOPS`.
 *
 * Переменная решает, какая запись `X-Forwarded-For` считается клиентом, и её
 * ошибка не даёт НИ ОДНОГО наблюдаемого следа: ни исключения, ни лога, ни
 * красного теста. Два направления отказа при этом разные и требуют разных
 * признаков:
 *
 *  · **хопов МЕНЬШЕ реальности** — снимается адрес собственного прокси/CDN,
 *    и все запросы схлопываются в один ключ. Каждый per-IP лимит продукта
 *    (выпуск OTP, verify-локаут, платные прокси Яндекса, лента) становится
 *    ГЛОБАЛЬНЫМ: пятый вход за минуту во всём продукте отдаёт 429 «слишком
 *    много запросов» человеку, сделавшему один;
 *  · **хопов БОЛЬШЕ реальности** — потребляется запись, которую подставил сам
 *    клиент, и per-IP лимит становится ОБХОДИМЫМ ротацией левой части XFF
 *    (ровно тот дефект, который закрыл HARDENING-08). Обычный трафик при этом
 *    выглядит нормально: у запроса без клиентского XFF цепочка короче хопов,
 *    снятие клампится к левому краю и возвращает настоящего клиента. То есть
 *    направление наблюдаемо ТОЛЬКО по конфигурации, а не по симптому.
 *
 * Отсюда три независимых сигнала на одном окне наблюдений:
 *
 *  1. `resolvedIsPrivate` — итоговый адрес приватный/loopback. Это «мы
 *     разрешили запрос в собственную инфраструктуру»: у настоящего клиента из
 *     интернета такого адреса на edge не бывает. Сигнал детерминированный, и
 *     он самый точный из трёх; в dev/test он бессмысленен (localhost — норма),
 *     поэтому включается только в production.
 *  2. `clamped` — цепочка КОРОЧЕ настроенных хопов, то есть настройка выше
 *     реальной топологии. Ловит второе направление по обычному трафику, хотя
 *     сам эксплуатирующий запрос не клампится.
 *  3. Разнообразие — мало различных адресов на много различных идентичностей.
 *     Ловит первое направление, когда edge отдаёт публичный адрес (CDN), и
 *     сигнал 1 молчит.
 *
 * 🔴 **Стоимость — ноль команд Redis на запрос.** Окно живёт в памяти процесса,
 * Redis трогается только в момент отправки алерта (окно молчания внутри
 * `sendTelegramAlert`). Процессов несколько и окно у каждого своё — это не
 * дефект: схлопывание глобально, значит его видит каждый процесс, а общий
 * Redis-cooldown не даёт им продублировать алерт. Сэмплированный вариант
 * (писать в общий счётчик раз в N запросов) дал бы точнее статистику ценой
 * записи на горячем пути входа — не тот размен.
 *
 * ⚠️ **Ложные срабатывания — честно.** Сигнал 3 не отличает схлопывание от
 * настоящего NAT: 25+ разных людей из одной корпоративной сети или из-под
 * CGNAT оператора дают ту же картину. Порог поэтому строгий (≤10 % адресов на
 * идентичность), окно молчания длинное, а текст алерта просит ПРОВЕРИТЬ
 * значение, а не утверждает, что оно неверно. Подкручивать порог до «выглядит
 * чисто» нельзя — это ровно та подгонка, из-за которой сторож перестаёт ловить
 * предмет.
 */

const WINDOW_SIZE = 60;
/** Оценивать не на каждом наблюдении: обход окна дешёвый, но и он не нужен чаще. */
const EVALUATION_STRIDE = 10;

const PRIVATE_RATIO_THRESHOLD = 0.9;
const CLAMP_RATIO_THRESHOLD = 0.9;
const DIVERSITY_MIN_IDENTITIES = 25;
const DIVERSITY_MAX_IP_RATIO = 0.1;

const ALERT_KEY = "proxy-trust:suspect";
/** Мисконфигурация не чинится сама — повторять чаще нечего. */
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type ProxyTrustObservation = {
  /** Хеш итогового адреса (сырые значения в памяти детектора не держим). */
  ipKey: string;
  /** Хеш идентичности (телефон/email) — только чтобы считать различия. */
  identityKey: string;
  clamped: boolean;
  resolvedIsPrivate: boolean;
};

export type ProxyTrustSuspicion = {
  code: "collapsed-to-infrastructure" | "hops-exceed-chain" | "identity-per-ip-collapse";
  message: string;
};

export type ProxyTrustEvaluationConfig = {
  /**
   * Учитывать ли сигнал приватного адреса. В dev/test — нет: там весь трафик
   * с loopback, и сигнал был бы шумом, а не признаком.
   */
  flagPrivateAddresses: boolean;
};

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Чистая половина детектора: окно наблюдений → подозрение или ничего.
 * Вынесена отдельно, чтобы проверялось ПОВЕДЕНИЕ на заданном распределении,
 * а не то, что мы позвали нужную функцию.
 */
export function evaluateProxyTrustWindow(
  observations: readonly ProxyTrustObservation[],
  config: ProxyTrustEvaluationConfig,
): ProxyTrustSuspicion | null {
  const total = observations.length;
  if (total < WINDOW_SIZE) return null;

  if (config.flagPrivateAddresses) {
    const privateRatio = ratio(
      observations.filter((entry) => entry.resolvedIsPrivate).length,
      total,
    );
    if (privateRatio >= PRIVATE_RATIO_THRESHOLD) {
      return {
        code: "collapsed-to-infrastructure",
        message:
          `клиентский IP разрешается в приватный адрес у ${percent(privateRatio)} ` +
          `из последних ${total} попыток входа — значит снимается адрес собственного ` +
          `прокси, а не клиента, и все per-IP лимиты стали общими`,
      };
    }
  }

  const clampRatio = ratio(observations.filter((entry) => entry.clamped).length, total);
  if (clampRatio >= CLAMP_RATIO_THRESHOLD) {
    return {
      code: "hops-exceed-chain",
      message:
        `у ${percent(clampRatio)} из последних ${total} попыток входа цепочка ` +
        `X-Forwarded-For короче настроенного числа хопов — значит TRUSTED_PROXY_HOPS ` +
        `выше реальной топологии, и per-IP лимиты обходятся подстановкой XFF`,
    };
  }

  const distinctIps = new Set(observations.map((entry) => entry.ipKey)).size;
  const distinctIdentities = new Set(observations.map((entry) => entry.identityKey)).size;
  if (
    distinctIdentities >= DIVERSITY_MIN_IDENTITIES &&
    ratio(distinctIps, distinctIdentities) <= DIVERSITY_MAX_IP_RATIO
  ) {
    return {
      code: "identity-per-ip-collapse",
      message:
        `${distinctIdentities} различных идентичностей за последние ${total} попыток ` +
        `входа пришли всего с ${distinctIps} различных адресов — похоже на схлопывание ` +
        `в адрес edge'а (либо на массовый перебор с одного источника)`,
    };
  }

  return null;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

const observationWindow: ProxyTrustObservation[] = [];
let cursor = 0;
let sinceLastEvaluation = 0;

/** Только для тестов: детектор держит состояние процесса. */
export function resetProxyTrustWindowForTests(): void {
  observationWindow.length = 0;
  cursor = 0;
  sinceLastEvaluation = 0;
}

export function proxyTrustWindowSizeForTests(): number {
  return observationWindow.length;
}

function record(observation: ProxyTrustObservation): void {
  if (observationWindow.length < WINDOW_SIZE) {
    observationWindow.push(observation);
  } else {
    observationWindow[cursor] = observation;
    cursor = (cursor + 1) % WINDOW_SIZE;
  }
}

/**
 * Наблюдение с auth-смежного пути. Никогда не бросает и ничего не ждёт:
 * отказ телеметрии не имеет права стоить пользователю входа (то же правило,
 * что у `maybeAlertLowSmsBalance`, FIX-B10).
 */
export function observeAuthClientIp(req: HeaderCarrier, identity: string): void {
  try {
    const diagnostics = resolveClientIpDiagnostics(req);
    record({
      ipKey: hashValue(diagnostics.resolvedIp ?? "unknown"),
      identityKey: hashValue(identity.trim().toLowerCase()),
      clamped: diagnostics.clamped,
      resolvedIsPrivate: diagnostics.resolvedIsPrivate,
    });

    sinceLastEvaluation += 1;
    if (observationWindow.length < WINDOW_SIZE || sinceLastEvaluation < EVALUATION_STRIDE) return;
    sinceLastEvaluation = 0;

    const suspicion = evaluateProxyTrustWindow(observationWindow, {
      flagPrivateAddresses: isProduction,
    });
    if (!suspicion) return;

    void sendTelegramAlert(
      `Похоже на неверный TRUSTED_PROXY_HOPS: ${suspicion.message}. ` +
        `Проверьте GET /api/admin/diagnostics/client-ip и сверьте resolvedIp ` +
        `с настоящим адресом клиента.`,
      ALERT_KEY,
      ALERT_COOLDOWN_MS,
    ).catch((error: unknown) => {
      logError("Proxy-trust alert failed", {
        error: error instanceof Error ? error.message : String(error),
        __skipAlert: true,
      });
    });
  } catch (error) {
    logError("Proxy-trust observation failed", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
}
