import { ZodError } from "zod";
import { findForbiddenWordsIssue } from "@/lib/moderation/zod";

export function formatZodError(error: ZodError): string {
  if (error.issues.length === 0) return "Invalid input";
  // FORBIDDEN-WORDS-01: отказ «запрещённые слова» отдаётся одной понятной
  // строкой, без машинного «поле: …» — его показывают человеку как есть.
  const forbidden = findForbiddenWordsIssue(error);
  if (forbidden) return forbidden.message;
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
