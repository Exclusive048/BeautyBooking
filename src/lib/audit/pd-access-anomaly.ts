import "server-only";

import { PdAccessActorType } from "@prisma/client";
import { logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { COMPLIANCE_FINGERPRINTS } from "@/lib/observability/compliance";
import { reportMessage } from "@/lib/observability/report";
import { prisma } from "@/lib/prisma";

/**
 * 29.09 доработки · 16 (PD-ACCESS-ANOMALY-DETECTION) — сигнал об аномальных
 * массовых чтениях ПДн поверх следа `PdAccessLog` (`lib/audit/pd-access.ts`).
 *
 * Раньше след был только scoping'ом («что читал актор X в окне Y» постфактум),
 * и его никто не читал. Теперь воркер раз в 15 минут агрегирует последний час
 * по (актор, тип актора, поверхность) и сравнивает с порогами.
 *
 * Пороги — константы в коде по типу актора (решение владельца 16.3): меняются
 * деплоем, как потолки ИИ (инв. #44). Первые две недели — РЕЖИМ НАБЛЮДЕНИЯ
 * (`PD_ANOMALY_ALERTS_ENABLED = false`): превышение пишется только в лог
 * `pd-access.anomaly.observed`, по этим записям подбираются числа, потом флаг
 * включается и сигнал уходит в Telegram и GlitchTip.
 *
 * 🔴 В сигнале нет IP и нет id человека: Telegram — иностранный сервис, отправка
 * туда ПДн была бы трансграничной передачей. Достаточно типа актора,
 * поверхности, суммы, окна и id последней строки `PdAccessLog` — по нему
 * дежурный находит актора в БД.
 */

export const PD_ANOMALY_WINDOW_MINUTES = 60;
/** Окно тишины сигнала на пару (тип актора, поверхность). */
export const PD_ANOMALY_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Режим наблюдения: пока `false`, превышение — только `logInfo`. */
export const PD_ANOMALY_ALERTS_ENABLED = false;

export type PdAnomalyThreshold = { maxRows: number; maxEvents: number | null };

/**
 * Решение 16.3: админ — больше 1 000 строк или 60 событий за час (≈20 страниц
 * списка по 50); мастер и студия — больше 3 000 строк за час. SYSTEM
 * (cron/воркер) не оценивается — это не человек, листающий базу.
 */
export const PD_ANOMALY_THRESHOLDS: Record<PdAccessActorType, PdAnomalyThreshold | null> = {
  ADMIN: { maxRows: 1000, maxEvents: 60 },
  MASTER: { maxRows: 3000, maxEvents: null },
  STUDIO: { maxRows: 3000, maxEvents: null },
  SYSTEM: null,
};

export type PdAccessWindowRow = {
  actorUserId: string | null;
  actorType: PdAccessActorType;
  surface: string;
  rowSum: number;
  eventCount: number;
};

export type PdAccessAnomaly = PdAccessWindowRow & { reason: "rows" | "events" };

/** Чистая оценка окна: строго БОЛЬШЕ порога — аномалия. */
export function evaluatePdAccessWindow(
  rows: readonly PdAccessWindowRow[],
  thresholds: Record<PdAccessActorType, PdAnomalyThreshold | null> = PD_ANOMALY_THRESHOLDS,
): PdAccessAnomaly[] {
  const out: PdAccessAnomaly[] = [];
  for (const row of rows) {
    const threshold = thresholds[row.actorType];
    if (!threshold) continue;
    if (row.rowSum > threshold.maxRows) out.push({ ...row, reason: "rows" });
    else if (threshold.maxEvents !== null && row.eventCount > threshold.maxEvents) out.push({ ...row, reason: "events" });
  }
  return out;
}

/** Текст сигнала — без IP и id человека (см. шапку). */
export function formatPdAnomalyAlert(anomaly: PdAccessAnomaly, lastLogId: string | null): string {
  return [
    "⚠️ Аномальное массовое чтение ПДн",
    `Тип актора: ${anomaly.actorType}`,
    `Поверхность: ${anomaly.surface}`,
    `За ${PD_ANOMALY_WINDOW_MINUTES} мин: строк ${anomaly.rowSum}, событий ${anomaly.eventCount}`,
    `Последняя строка PdAccessLog: ${lastLogId ?? "—"}`,
  ].join("\n");
}

export async function detectPdAccessAnomalies(now: Date = new Date()): Promise<PdAccessAnomaly[]> {
  const since = new Date(now.getTime() - PD_ANOMALY_WINDOW_MINUTES * 60_000);
  const groups = await prisma.pdAccessLog.groupBy({
    by: ["actorUserId", "actorType", "surface"],
    where: { createdAt: { gte: since } },
    _sum: { rowCount: true },
    _count: { _all: true },
  });
  const anomalies = evaluatePdAccessWindow(
    groups.map((g) => ({
      actorUserId: g.actorUserId,
      actorType: g.actorType,
      surface: g.surface,
      rowSum: g._sum.rowCount ?? 0,
      eventCount: g._count._all,
    })),
  );

  for (const anomaly of anomalies) {
    const last = await prisma.pdAccessLog.findFirst({
      where: {
        actorUserId: anomaly.actorUserId,
        actorType: anomaly.actorType,
        surface: anomaly.surface,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const lastLogId = last?.id ?? null;
    const facts = {
      actorType: anomaly.actorType,
      surface: anomaly.surface,
      rowSum: anomaly.rowSum,
      eventCount: anomaly.eventCount,
      reason: anomaly.reason,
      windowMinutes: PD_ANOMALY_WINDOW_MINUTES,
      lastLogId,
    };
    if (!PD_ANOMALY_ALERTS_ENABLED) {
      logInfo("pd-access.anomaly.observed", facts);
      continue;
    }
    await sendTelegramAlert(
      formatPdAnomalyAlert(anomaly, lastLogId),
      `pd-access:anomaly:${anomaly.actorType}:${anomaly.surface}`,
      PD_ANOMALY_ALERT_COOLDOWN_MS,
    );
    reportMessage(COMPLIANCE_FINGERPRINTS.pdAccessAnomaly, {
      level: "warning",
      tags: { compliance_writer: COMPLIANCE_FINGERPRINTS.pdAccessAnomaly, actorType: anomaly.actorType },
      extra: facts,
    });
  }
  return anomalies;
}
