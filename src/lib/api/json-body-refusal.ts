/**
 * CSRF-CONTENT-TYPE-LAYER — отказ JSON-телу не того типа для роутов, которые
 * читают тело САМИ (`await req.json()`), а не через `parseBody`.
 *
 * Правило и обоснование — `lib/http/json-content-type.ts`; у `parseBody` та же
 * проверка (`assertJsonContentType`). Здесь — форма для роута:
 *
 *   const refusal = nonJsonBodyRefusal(req);
 *   if (refusal) return refusal;
 *   const body = await req.json().catch(() => null);
 *
 * Вызов обязан стоять в той же функции, что и чтение тела, — так его ищет
 * сторож полноты (`lib/http/request-body-readers.test.ts`). Чтение тела без
 * проверки допустимо только для файла из реестра `REQUEST_BODY_READERS`.
 */

import { fail } from "@/lib/api/response";
import {
  NON_JSON_BODY_CODE,
  NON_JSON_BODY_MESSAGE,
  NON_JSON_BODY_STATUS,
  shouldRejectNonJsonBody,
} from "@/lib/http/json-content-type";

/** 415-ответ, если тело запроса заявлено не как JSON; иначе `null`. */
export function nonJsonBodyRefusal(req: Request): Response | null {
  if (!shouldRejectNonJsonBody(req.headers)) return null;
  return fail(NON_JSON_BODY_MESSAGE, NON_JSON_BODY_STATUS, NON_JSON_BODY_CODE);
}
