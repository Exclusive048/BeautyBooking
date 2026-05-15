import { ReviewReportReason } from "@prisma/client";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.reviews.reportReasons;

/** Maps the Prisma `ReviewReportReason` enum value to its Russian
 * display label. Centralised so every UI surface (card, KPI tile,
 * audit log viewer) renders the same label. */
export function reportReasonLabel(reason: ReviewReportReason): string {
  switch (reason) {
    case ReviewReportReason.SPAM:
      return T.SPAM;
    case ReviewReportReason.FAKE:
      return T.FAKE;
    case ReviewReportReason.OFFENSIVE:
      return T.OFFENSIVE;
    case ReviewReportReason.INAPPROPRIATE:
      return T.INAPPROPRIATE;
    case ReviewReportReason.OTHER:
      return T.OTHER;
  }
}
