import "server-only";

import { reportMessage } from "@/lib/observability/report";

/**
 * HARDENING-MISC-01 (COMPLIANCE-WRITE-OBSERVABILITY) — единая точка сигнала о
 * том, что запись доказательства не удалась.
 *
 * ## Класс проблемы
 *
 * В проекте есть ветки, которые **намеренно** глотают ошибку записи, чтобы не
 * ронять пользовательский запрос. Это верный размен доступности: человек не
 * должен застрять на середине логина или брони из-за журнала. Но у размена
 * есть обратная сторона — в проде устойчивый сбой означает, что доказательства
 * тихо перестают накапливаться, а ПДн тихо перестают стираться, и узнаём мы об
 * этом в момент, когда поздно.
 *
 * `logError` тут уже есть везде. Чего не было — **сгруппированного,
 * алертопригодного** сигнала: строка в stdout при ротации логов не переживает
 * недели и не поднимает alert-rule.
 *
 * ## Контракт
 *
 * • `logError` на месте и остаётся — этот вызов ДОПОЛНЯЕТ, а не заменяет;
 * • при выключенном GlitchTip (`reportMessage` без reporter'а) всё вырождается
 *   в no-op, и поведение возвращается ровно к сегодняшнему — новой зависимости
 *   и нового режима отказа не появляется;
 * • fingerprint стабилен и низкокардинален: он станет именем alert-rule, и
 *   переименование осиротит правило. Значения перечислены здесь и продублированы
 *   в §8 снапшота — менять их только осознанно.
 */

/**
 * Стабильные идентификаторы группировки. **Не переименовывать без правки
 * alert-rules в GlitchTip** — иначе правило останется висеть на имени, которого
 * больше никто не шлёт, и молчание будет выглядеть как «всё хорошо».
 */
export const COMPLIANCE_FINGERPRINTS = {
  /** `recordUserConsents` / `recordGuestConsents` — доказательство согласия не записано. */
  consentWrite: "compliance.consent-write-failed",
  /** `recordPdAccess` — событие массового чтения ПДн не записано. */
  pdAccessWrite: "compliance.pd-access-write-failed",
  /** `enqueueMediaPurge` — задача на удаление медиа не поставлена: аккаунт удалён, байты остались. */
  mediaPurgeEnqueue: "compliance.media-purge-enqueue-failed",
  /**
   * `detectPdAccessAnomalies` — массовое чтение ПДн сверх порога (29.09 доработки · 16).
   * Не сбой записи, а сигнал; имя — такой же контракт с alert-rule.
   */
  pdAccessAnomaly: "compliance.pd-access-anomaly",
} as const;

export type ComplianceFingerprint =
  (typeof COMPLIANCE_FINGERPRINTS)[keyof typeof COMPLIANCE_FINGERPRINTS];

/**
 * Сообщить о провале записи доказательства.
 *
 * `extra` уходит через тот же `scrubEvent` в `beforeSend`, что и остальные
 * события, поэтому сюда нельзя класть больше, чем уже лежит в соседнем
 * `logError` — и не нужно: для алерта важны факт, писатель и порядок величины,
 * а не содержимое.
 */
export function reportComplianceWriteFailure(
  fingerprint: ComplianceFingerprint,
  error: unknown,
  extra: Record<string, unknown> = {},
): void {
  reportMessage(fingerprint, {
    level: "error",
    tags: { compliance_writer: fingerprint },
    extra: {
      ...extra,
      error: error instanceof Error ? error.message : String(error),
    },
  });
}
