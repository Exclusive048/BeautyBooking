import { ReviewReportReason } from "@prisma/client";

/**
 * Heuristic for "this report needs admin attention right now":
 *   - the review is actually reported (`reportedAt != null`), AND
 *   - either rating is 1 (lowest possible — usually maps to outrage)
 *     or the report reason is `OFFENSIVE` (legal/safety risk).
 *
 * Tuned to flag the cases that would embarrass the platform if left
 * unmoderated for a day; everything else can wait in the regular
 * queue. Pure function so the rule can be tweaked / unit-tested
 * without touching service code.
 */
export function isUrgentReport(input: {
  reportedAt: Date | string | null;
  rating: number;
  reportReason: ReviewReportReason | null;
}): boolean {
  if (!input.reportedAt) return false;
  if (input.rating === 1) return true;
  if (input.reportReason === ReviewReportReason.OFFENSIVE) return true;
  return false;
}
