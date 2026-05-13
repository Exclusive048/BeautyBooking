import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.reviews.header;

type Props = {
  pendingReports: number;
};

/** "Модерация · N жалоб ожидают" caption. Pending count tracks the
 * KPI tile but stays inline so admins immediately see how much work
 * is on the queue. */
export function ReviewsHeader({ pendingReports }: Props) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-sec">
      <span>{T.caption}</span>
      {pendingReports > 0 ? (
        <>
          <span className="mx-1.5 text-text-sec/40" aria-hidden>
            ·
          </span>
          <span>
            <span className="tabular-nums text-amber-600 dark:text-amber-400">
              {pendingReports}
            </span>{" "}
            {T.pendingSuffix}
          </span>
        </>
      ) : null}
    </p>
  );
}
