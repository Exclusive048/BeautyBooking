import "server-only";

import { randomUUID } from "node:crypto";

import { logError, logInfo } from "@/lib/logging/logger";
import {
  COMPLIANCE_FINGERPRINTS,
  reportComplianceWriteFailure,
} from "@/lib/observability/compliance";
import { enqueue } from "@/lib/queue/queue";
import { MEDIA_PURGE_JOB_TYPE, type MediaPurgePayload } from "@/lib/queue/types";

/**
 * DELETION-02 — единственная точка постановки задачи на удаление медиа.
 *
 * Вынесено из трёх флоу удаления, чтобы правила были одни на всех:
 *   • enqueue **после** коммита транзакции — задача на необратимое удаление
 *     байтов не должна уехать раньше, чем удаление данных зафиксировано;
 *   • список id логируется на постановке — удаление из S3 необратимо, и в
 *     аудите должно остаться, что именно было заявлено;
 *   • провал постановки НЕ откатывает удаление аккаунта/кабинета (пользователь
 *     своё удаление получил), но пишется громко — тот же класс, что
 *     COMPLIANCE-WRITE-OBSERVABILITY.
 */
export async function enqueueMediaPurge(
  assets: Array<{ id: string; storageKey: string }>,
  reason: MediaPurgePayload["reason"],
  actorUserId: string | null,
): Promise<void> {
  if (assets.length === 0) return;

  logInfo("Media purge enqueued", {
    reason,
    actorUserId,
    assetIds: assets.map((a) => a.id),
  });

  try {
    await enqueue({
      id: randomUUID(),
      type: MEDIA_PURGE_JOB_TYPE,
      payload: { assets, reason, actorUserId },
    });
  } catch (error) {
    logError("Failed to enqueue media purge", {
      reason,
      actorUserId,
      assetIds: assets.map((a) => a.id),
      error: error instanceof Error ? error.message : String(error),
    });
    // HARDENING-MISC-01: аккаунт уже удалён, а байты остались — и без сигнала
    // об этом никто не узнает. (Провал САМОЙ задачи после ретраев ловится
    // отдельно: `moveToDeadQueue` шлёт `job.deadLetter` с jobType=media.purge.)
    reportComplianceWriteFailure(COMPLIANCE_FINGERPRINTS.mediaPurgeEnqueue, error, {
      reason,
      assetCount: assets.length,
    });
  }
}
