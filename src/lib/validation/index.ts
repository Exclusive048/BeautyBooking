import { z, ZodError } from "zod";
import { AppError } from "@/lib/api/errors";
import { MAX_JSON_BODY_BYTES, readBodyTextCapped } from "@/lib/http/body-limit";
import {
  NON_JSON_BODY_CODE,
  NON_JSON_BODY_MESSAGE,
  NON_JSON_BODY_STATUS,
  shouldRejectNonJsonBody,
} from "@/lib/http/json-content-type";
import { findForbiddenWordsIssue } from "@/lib/moderation/zod";

type ValidationIssue = {
  path: string;
  message: string;
  code: string;
};

type ValidationDetails = {
  issues: ValidationIssue[];
};

function formatZodIssues(error: ZodError): ValidationDetails {
  const issues = error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "input",
    message: issue.message,
    code: issue.code,
  }));
  return { issues };
}

function validationError(message: string, details: ValidationDetails): AppError {
  return new AppError(message, 400, "VALIDATION_ERROR", details);
}

/**
 * CSRF-CONTENT-TYPE-LAYER — третий слой CSRF: JSON-тело только с
 * `Content-Type: application/json` (кроме `Authorization: Bearer`). Почему
 * тип — `lib/http/json-content-type.ts`. Бросает 415 `UNSUPPORTED_MEDIA_TYPE`.
 */
export function assertJsonContentType(req: Request): void {
  if (shouldRejectNonJsonBody(req.headers)) {
    throw new AppError(NON_JSON_BODY_MESSAGE, NON_JSON_BODY_STATUS, NON_JSON_BODY_CODE);
  }
}

export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<T> {
  // CSRF-CONTENT-TYPE-LAYER: тип проверяется ДО чтения — тело простого
  // межсайтового запроса (`text/plain`, форма) не читается вовсе.
  assertJsonContentType(req);

  // SEC-16, слой 2: считаем фактические байты. Zod ограничивает поля только
  // после разбора, а `Content-Length` (слой 1 в `proxy.ts`) может отсутствовать
  // или лгать — поэтому граница обязана быть и здесь.
  const read = await readBodyTextCapped(req, maxBytes);
  if (!read.ok) {
    throw new AppError("Вы отправили слишком много за раз. Сократите и попробуйте ещё раз.", 413, "REQUEST_BODY_TOO_LARGE");
  }

  let body: unknown;
  try {
    body = JSON.parse(read.text) as unknown;
  } catch {
    throw validationError("Не удалось прочитать отправленное. Обновите страницу и попробуйте ещё раз.", {
      issues: [{ path: "body", message: "Не удалось прочитать отправленное. Обновите страницу и попробуйте ещё раз.", code: "invalid_json" }],
    });
  }

  return parseValue(body, schema);
}

function parseValue<T>(body: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // FORBIDDEN-WORDS-01: запрещённые слова — свой код и понятный текст, а не
    // общее «проверьте поля»: человеку нужно знать, что именно убрать.
    const forbidden = findForbiddenWordsIssue(parsed.error);
    if (forbidden) {
      throw new AppError(forbidden.message, 422, "FORBIDDEN_WORDS", {
        field: forbidden.path.length > 0 ? forbidden.path.join(".") : "input",
      });
    }
    throw validationError("Проверьте правильность заполнения полей.", formatZodIssues(parsed.error));
  }
  return parsed.data;
}

/**
 * Тело, которое можно не присылать вовсе: кнопка без полей («Разблокировать»,
 * «Отклонить» жалобу без пометки) шлёт POST без тела и без типа.
 *
 * Пустое тело данных не несёт — подделывать нечего, поэтому тип не требуется
 * и схема разбирает `{}`. Непустое — правила `parseBody`: тип JSON
 * (CSRF-CONTENT-TYPE-LAYER, иначе 415), граница размера (SEC-16), разбор и
 * схема. Читается тело один раз и с границей — до решения о типе, потому что
 * «пусто ли» без чтения не узнать (`Content-Length` может отсутствовать).
 */
export async function parseOptionalBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<T> {
  const read = await readBodyTextCapped(req, maxBytes);
  if (!read.ok) {
    throw new AppError("Вы отправили слишком много за раз. Сократите и попробуйте ещё раз.", 413, "REQUEST_BODY_TOO_LARGE");
  }
  if (!read.text.trim()) return parseValue({}, schema);
  assertJsonContentType(req);
  let body: unknown;
  try {
    body = JSON.parse(read.text) as unknown;
  } catch {
    throw validationError("Не удалось прочитать отправленное. Обновите страницу и попробуйте ещё раз.", {
      issues: [{ path: "body", message: "Не удалось прочитать отправленное. Обновите страницу и попробуйте ещё раз.", code: "invalid_json" }],
    });
  }
  return parseValue(body, schema);
}

export function parseQuery<T>(url: URL, schema: z.ZodType<T>): T {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw validationError("Проверьте правильность заполнения полей.", formatZodIssues(parsed.error));
  }
  return parsed.data;
}
