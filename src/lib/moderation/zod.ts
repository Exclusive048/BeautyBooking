import type { z } from "zod";
import * as UI_TEXT from "@/lib/ui/text";
import { hasForbiddenWords, type ForbiddenScope } from "@/lib/moderation/forbidden-words";

/** Метка отказа «запрещённые слова» в issue Zod — по ней `parseBody` и
 *  `formatZodError` отдают понятный текст вместо общего «Проверьте поля». */
export const FORBIDDEN_WORDS_REASON = "forbidden_words";

/**
 * FORBIDDEN-WORDS-01 — проверка публичного поля в схеме: одна строка на поле.
 * `scope: "name"` — имена, названия, адрес страницы (плюс правило «выдача себя за
 * платформу»), `"text"` — свободный текст.
 *
 *   displayName: z.string().trim().max(120).superRefine(rejectForbiddenWords("name")).optional()
 */
export function rejectForbiddenWords(scope: ForbiddenScope) {
  return (value: string | null | undefined, ctx: z.RefinementCtx) => {
    if (typeof value === "string" && hasForbiddenWords(value, scope)) {
      ctx.addIssue({
        code: "custom",
        message: UI_TEXT.moderation.forbiddenWords,
        params: { reason: FORBIDDEN_WORDS_REASON },
      });
    }
  };
}

/** Есть ли среди ошибок Zod отказ «запрещённые слова». */
export function findForbiddenWordsIssue(error: z.ZodError): z.core.$ZodIssue | null {
  return (
    error.issues.find(
      (issue) =>
        issue.code === "custom" &&
        (issue as { params?: { reason?: string } }).params?.reason === FORBIDDEN_WORDS_REASON,
    ) ?? null
  );
}
