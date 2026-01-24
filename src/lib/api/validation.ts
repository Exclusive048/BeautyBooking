import { ZodError } from "zod";

export function formatZodError(error: ZodError): string {
  if (error.issues.length === 0) return "Invalid input";
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
