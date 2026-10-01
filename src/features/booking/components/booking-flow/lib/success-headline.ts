import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.publicProfile.bookingWidget;

/**
 * FIX-C3 · SMOKE-01 · F4 — заголовок экрана успеха.
 *
 * Шаблон — «{name} ждёт вас», то есть при пустом имени он даёт **строку,
 * начинающуюся с пробела**: « ждёт вас». Ровно это и увидел смоук на экране
 * успеха основной конверсионной воронки.
 *
 * Первопричина починена выше по потоку (имя приходит пропом и больше не зависит
 * от best-effort-фетча), но подстановка остаётся защищённой: подставить пустое
 * имя может любой будущий путь, а цена ошибки — испорченный последний экран
 * записи. Тот же приём уже применён в студийном виджете
 * (`success.masterName || anyMaster`), и это единственная причина, по которой
 * он F4 не воспроизвёл, — стоит иметь его на обеих поверхностях, а не на одной.
 *
 * Пустое имя даёт заголовок БЕЗ имени, а не заголовок с дырой: «Вы записаны» —
 * это правда в любом случае, и она уже используется как надпись над заголовком.
 */
export function buildSuccessHeadline(providerName: string, status?: string): string {
  const name = providerName.trim();
  if (isAwaitingConfirmation(status)) {
    if (!name) return T.successPendingHeadlineFallback;
    return T.successPendingHeadlineTemplate.replace("{name}", name);
  }
  if (!name) return T.successEyebrow;
  return T.successHeadlineTemplate.replace("{name}", name);
}

/**
 * DEV-SCENARIO-01: неподтверждённая запись (`NEW` / `PENDING`) — ещё не «вы
 * записаны»: мастер может отказать, а без ответа она отменится сама
 * (`PENDING_EXPIRY_HOURS`). Экран успеха говорит это прямо.
 */
export function isAwaitingConfirmation(status: string | undefined): boolean {
  return status === "PENDING" || status === "NEW";
}
