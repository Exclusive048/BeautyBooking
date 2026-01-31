import { z, ZodError } from "zod";
import { AppError } from "@/lib/api/errors";

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

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw validationError("Invalid JSON body", {
      issues: [{ path: "body", message: "Invalid JSON", code: "invalid_json" }],
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw validationError("Validation error", formatZodIssues(parsed.error));
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
    throw validationError("Validation error", formatZodIssues(parsed.error));
  }
  return parsed.data;
}
