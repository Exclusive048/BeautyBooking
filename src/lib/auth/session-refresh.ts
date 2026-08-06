import type { NextResponse } from "next/server";

import { rotateSessionCookies } from "@/lib/auth/session";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

/**
 * PERF-14 — единственная точка «обменять refresh-токен на новую пару кук».
 *
 * Зачем отдельный модуль. Обновление сессии зовут ДВА места: роут
 * `POST /api/auth/refresh` (его дёргает клиент) и `src/proxy.ts` (прозрачное
 * обновление, LOGIC-22). До этого прокси звал роут **по HTTP — к самому себе**,
 * поэтому телеметрия писалась один раз, внутри роута. Теперь прокси вызывает
 * ротацию напрямую, и без общей обёртки события `surface: "auth"` пропали бы
 * ровно с того пути, по которому идёт большинство обновлений, — а «событий нет»
 * читается как «отказов нет».
 *
 * Метка операции намеренно осталась `refresh-post`, хотя вызов из прокси уже не
 * POST: это одна и та же логическая операция, и переименование осиротило бы
 * существующие дашборды по тому же механизму, что описан для fingerprint'ов
 * compliance-сбоев.
 */
export async function rotateSessionWithTelemetry(
  response: NextResponse,
  refreshToken: string,
): Promise<boolean> {
  const session = await rotateSessionCookies(response, refreshToken);
  if (!session) {
    void recordSurfaceEvent({
      surface: "auth",
      outcome: "failure",
      operation: "refresh-post",
      code: "INVALID_REFRESH_TOKEN",
    });
    return false;
  }
  return true;
}
