import { z, ZodError } from "zod";
import { AppError } from "@/lib/api/errors";
import { MAX_JSON_BODY_BYTES, readBodyTextCapped } from "@/lib/http/body-limit";

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

export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<T> {
  // SEC-16, слой 2: считаем фактические байты. Zod ограничивает поля только
  // после разбора, а `Content-Length` (слой 1 в `proxy.ts`) может отсутствовать
  // или лгать — поэтому граница обязана быть и здесь.
  const read = await readBodyTextCapped(req, maxBytes);
  if (!read.ok) {
    throw new AppError("Слишком большой запрос.", 413, "REQUEST_BODY_TOO_LARGE");
  }

  let body: unknown;
  try {
    body = JSON.parse(read.text) as unknown;
  } catch {
    throw validationError("Некорректный формат запроса.", {
      issues: [{ path: "body", message: "Некорректный формат запроса.", code: "invalid_json" }],
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw validationError("Проверьте правильность заполнения полей.", formatZodIssues(parsed.error));
  }
  return parsed.data;
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
