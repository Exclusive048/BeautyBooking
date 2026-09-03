import { fail } from "@/lib/api/response";
import type { OtpRateLimitRefusal } from "@/lib/auth/otp-rate-limit";

/**
 * FIX-B14 · OTP-RATE-LIMIT-RAW-ENVELOPE — отказ лимитера OTP отвечает конвертом
 * проекта и русским текстом.
 *
 * До этого все четыре OTP-роута собирали ответ руками:
 *
 *     NextResponse.json({ error: rateLimit.error, retryAfterSec }, { status })
 *
 * то есть в поле, где клиент ждёт данные об ошибке, уезжала строка
 * `"RATE_LIMIT_UNAVAILABLE"` — машинный код вместо сообщения, по-английски, на
 * ЕДИНСТВЕННОМ включённом в проде канале входа (`PHONE_AUTH_ENABLED` off, §7).
 * Поля `message` в ответе не было вовсе, поэтому `fetchJson` (`lib/http/client.ts`)
 * доходил до `res.statusText`, а у ответа `NextResponse.json` он пустой — и
 * пользователь при обрыве Redis видел пустую ошибку под формой входа.
 *
 * 🔴 Вторая, более долговечная половина находки — **гейт этого не видел**.
 * `check:error-message-lang` обещает ловить английский текст, покидающий сервер
 * к пользователю, но знает ровно пять каналов (`fail` / `jsonFail` /
 * `new AppError` / `tooManyRequests` / `validationError`). Ответ, собранный
 * `NextResponse.json` вручную, для него невидим по построению — не «пропущен»,
 * а вне области. Инвентарь таких обходов заморожен
 * (`api/error-envelope-bypass.test.ts`), чтобы следующий появлялся как красный
 * тест, а не как английская строка на боевом экране.
 *
 * Коды на проводе выровнены с тем, что FIX-B12 сделал в `proxy.ts`: исчерпанный
 * бюджет — 429 `RATE_LIMITED`, невозможность посчитать лимит — 503
 * `RATE_LIMIT_UNAVAILABLE`. Различие обязано быть видимым: 503 говорит «повторите»,
 * 429 — «вы слишком часто», и раньше пользователь, сделавший ОДИН запрос при
 * упавшем Redis, читал второе.
 */
const REFUSAL_COPY: Record<OtpRateLimitRefusal["error"], { message: string; code: string }> = {
  RATE_LIMIT: {
    message: "Слишком часто. Подождите минуту и попробуйте ещё раз.",
    code: "RATE_LIMITED",
  },
  RATE_LIMIT_UNAVAILABLE: {
    message: "Сейчас это временно недоступно. Попробуйте ещё раз через минуту.",
    code: "RATE_LIMIT_UNAVAILABLE",
  },
  OTP_LOCKED: {
    message: "Слишком много попыток. Попробуйте позже.",
    code: "OTP_LOCKED",
  },
};

export function otpRateLimitFail(refusal: OtpRateLimitRefusal) {
  const { message, code } = REFUSAL_COPY[refusal.error];
  const response = fail(message, refusal.status, code, {
    retryAfterSeconds: refusal.retryAfterSec,
  });
  // `Retry-After` сохранён: он был у прежнего конверта и его читают клиенты
  // (в т.ч. `.qa/diagnostics/security-audit/harness.ts`).
  response.headers.set("Retry-After", String(refusal.retryAfterSec));
  return response;
}
