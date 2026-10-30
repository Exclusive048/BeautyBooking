import { z } from "zod";
import { logError } from "@/lib/logging/logger";
import { sendAlertWithCooldown } from "@/lib/monitoring/alert-cooldown";
import { ok, fail } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";
import { readBodyTextCapped } from "@/lib/http/body-limit";
import { getClientIp } from "@/lib/http/ip";
import { toReportedPagePath } from "@/lib/observability/report-path";
import { scrubString } from "@/lib/observability/scrub";
import { nonJsonBodyRefusal } from "@/lib/api/json-body-refusal";

export const runtime = "nodejs";

const schema = z.object({
  message: z.string().max(500).optional(),
  digest: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
  userAgent: z.string().max(500).optional(),
});

// 20 client errors per minute per IP — prevents log flooding
const RATE_WINDOW = 60;
const RATE_MAX = 20;

const CLIENT_ERROR_MESSAGE = "[client-error-boundary]";
/** Один ключ паузы на все клиентские отчёты (ALERT-CONTEXT-ALLOWLIST). */
const CLIENT_ERROR_ALERT_KEY = "client-error-boundary";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    // SECURITY-EXPOSURE-AUDIT-01 · Y2: здесь читали `true`-«разрешено» legacy-
    // перегрузки как «ограничено». Перегрузки больше нет (29.09 доработки · 15):
    // ответ несёт причину, отказ — через общий `resolveRateLimitRefusal`.
    const refusal = resolveRateLimitRefusal(
      await checkRateLimit(routeRateLimitKey(req, "ip", ip), { maxRequests: RATE_MAX, windowSeconds: RATE_WINDOW }),
    );
    if (refusal) {
      return fail(refusal.message, refusal.status, refusal.code);
    }

    // SEC-16: Zod ограничивает поля только ПОСЛЕ разбора — граница размера
    // обязана стоять до него.
    const nonJson = nonJsonBodyRefusal(req);
    if (nonJson) return nonJson;
    const read = await readBodyTextCapped(req);
    if (!read.ok) {
      return fail("Слишком большой запрос.", 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(read.text) as unknown;
    } catch {
      return fail("Некорректный формат запроса.", 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("Проверьте правильность заполнения полей.", 400);
    }

    const { message, digest, url, userAgent } = parsed.data;

    // ALERT-CONTEXT-ALLOWLIST (D-02). Отчёт присылает аноним, поэтому:
    //  · адрес — только шаблоном пути (`/booking/manage/:token`): полный
    //    `location.href` клал в лог действующий токен управления чужой записью
    //    и id из пути; query и hash отбрасываются;
    //  · текст ошибки — через скраббер: он цитирует адреса запросов, а с ними
    //    те же токены. Поле — `errorMessage`: ключ `message` в мете затирал в
    //    строке лога её собственный `message`, и поиск по
    //    «[client-error-boundary]» эти отчёты не находил;
    //  · алерт — отдельно и под ОДНИМ ключом. Группой паузы был присланный
    //    `message`, то есть каждое новое сообщение обходило паузу: 20 отчётов в
    //    минуту с одного адреса (лимит роута) — 20 сообщений в ops-чат, что
    //    упирается в лимит самого Telegram для группы и глушит настоящие алерты.
    //    Ключ из присланного поля (`digest` тоже присылает клиент) ограничить
    //    нельзя ничем, кроме отказа от него; число скрытых повторов несёт
    //    следующий алерт. И мимо счётчика частоты ошибок API (`__skipAlert`
    //    глушит оба): падение страницы в браузере — не ошибка API, а иначе
    //    поток анонимных отчётов держал бы критический «Высокая частота ошибок
    //    API» на каждом окне.
    const report = {
      errorMessage: message ? scrubString(message) : "(no message)",
      digest,
      route: toReportedPagePath(url),
    };
    logError(CLIENT_ERROR_MESSAGE, { ...report, userAgent, __skipAlert: true });
    void sendAlertWithCooldown("error", CLIENT_ERROR_MESSAGE, report, {
      key: CLIENT_ERROR_ALERT_KEY,
      connect: false,
    }).catch(() => undefined);

    return ok({});
  } catch (err) {
    logError("log-error endpoint failed", { err });
    return ok({});
  }
}
