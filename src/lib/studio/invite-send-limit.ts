import { checkRateLimit, refundRateLimit, type RateLimitConfig, type RateLimitResult } from "@/lib/rate-limit";
import { routeRateLimitKey, type RateLimitKey } from "@/lib/rate-limit/keys";

/**
 * STUDIO-INVITE-LIMITS (D-03, 2026-10-30) — сколько приглашений в команду может
 * отправить студия.
 *
 * Приглашение по почте — письмо с домена платформы на адрес, который вписала
 * студия, с её названием в теме. До этого его ограничивал только общий тир прокси
 * `cabinetMutation` (60 в минуту на аккаунт) — около 86 000 писем в сутки с одного
 * аккаунта. Почта уходит через тот же ящик Яндекс 360, что и коды входа (в проде
 * это единственный включённый канал входа): выработанная квота или репутация
 * домена — это «войти нельзя» для всех.
 *
 * Бюджет тратит ФАКТ — новое приглашение или повторная отправка, а не запрос:
 * отказ (нет прав, полная команда, мастер уже добавлен, потолок ожидающих) и
 * повтор на уже приглашённый адрес попытку возвращают. Осей две:
 *  - студия — 20 в сутки. Столько мастеров у самого большого тарифа (PREMIUM),
 *    то есть всю команду можно пригласить за один день; ось не зависит от того,
 *    кто из администраторов отправляет;
 *  - аккаунт — 10 в час. Держит аккаунт, администрирующий несколько студий, и
 *    растягивает всплеск; набрать команду из 20 человек — два часа.
 * Обе — по шаблону пути роута (`routeRateLimitKey`), поэтому у создания и у
 * повторной отправки вёдра свои: на студию выходит не больше 20 новых
 * приглашений и 20 повторов в сутки. Оба пути чувствительны (`/api/studio` —
 * префикс, повтор — точный шаблон в `SENSITIVE_ROUTE_TEMPLATES`): при обрыве
 * Redis — 503, а не память процесса.
 */
export const STUDIO_INVITE_SEND_LIMITS = {
  perStudio: { windowSeconds: 24 * 60 * 60, maxRequests: 20 },
  perAccount: { windowSeconds: 60 * 60, maxRequests: 10 },
} as const satisfies Record<string, RateLimitConfig>;

export const STUDIO_INVITE_LIMIT_MESSAGES = {
  perStudio: "Слишком много приглашений за сутки. Попробуйте завтра.",
  perAccount: "Слишком много приглашений за час. Попробуйте через час.",
  unavailable: "Сейчас это временно недоступно. Попробуйте ещё раз через минуту.",
} as const;

export type StudioInviteSendRefusal = {
  status: 429 | 503;
  message: string;
  code: "RATE_LIMITED" | "RATE_LIMIT_UNAVAILABLE";
  retryAfterSeconds: number;
};

export type StudioInviteSendBudget =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; refusal: StudioInviteSendRefusal };

function refusalFor(
  result: Extract<RateLimitResult, { limited: true }>,
  axis: keyof typeof STUDIO_INVITE_SEND_LIMITS,
): StudioInviteSendRefusal {
  if (result.reason === "unavailable") {
    return {
      status: 503,
      message: STUDIO_INVITE_LIMIT_MESSAGES.unavailable,
      code: "RATE_LIMIT_UNAVAILABLE",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  return {
    status: 429,
    message: STUDIO_INVITE_LIMIT_MESSAGES[axis],
    code: "RATE_LIMITED",
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/**
 * Взять одну попытку у студии и у аккаунта. Зовётся ПОСЛЕ проверки прав на
 * студию — иначе чужой мог бы выбрать её суточный бюджет — и до записи. Если
 * приглашение в итоге не создано и письмо не ушло, вызывающий возвращает
 * попытку (`refund`).
 */
export async function takeStudioInviteSendBudget(
  req: Request,
  input: { studioId: string; userId: string },
): Promise<StudioInviteSendBudget> {
  const studioKey = routeRateLimitKey(req, "studio", input.studioId);
  const studio = await checkRateLimit(studioKey, STUDIO_INVITE_SEND_LIMITS.perStudio);
  if (studio.limited) return { ok: false, refusal: refusalFor(studio, "perStudio") };

  const accountKey = routeRateLimitKey(req, "user", input.userId);
  const account = await checkRateLimit(accountKey, STUDIO_INVITE_SEND_LIMITS.perAccount);
  if (account.limited) {
    await refundRateLimit(studioKey);
    return { ok: false, refusal: refusalFor(account, "perAccount") };
  }

  const taken: RateLimitKey[] = [studioKey, accountKey];
  let refunded = false;
  return {
    ok: true,
    // Одна попытка — один возврат: `refundRateLimit` уменьшает счётчик, и
    // второй вызов вернул бы попытку, которой не брали.
    refund: async () => {
      if (refunded) return;
      refunded = true;
      for (const key of taken) await refundRateLimit(key);
    },
  };
}
