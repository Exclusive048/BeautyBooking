"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UI_TEXT } from "@/lib/ui/text";
import { useSaveStatus } from "./save-status-provider";

const S = UI_TEXT.cabinetMaster.scheduleSettings.studioApproval;

type Props = {
  /** Studio's display name (shown in the banner copy). */
  studioName: string;
  /** Whether a ScheduleChangeRequest is already PENDING for this master at load. */
  initialPending: boolean;
};

/**
 * QA-114 (FIX-06): surfaces the studio-approval flow for a studio master in the
 * schedule editor. A studio master's edits never apply live — they route to a
 * `ScheduleChangeRequest` awaiting studio approval (verified end-to-end in
 * QA-06/QA-08). The editor previously gave zero feedback, so the master believed
 * their change applied. This banner reads the shared auto-save status: on a
 * successful save it flips to "sent for approval" + shows a PENDING badge; it
 * also shows the badge when a request was already pending at page load.
 *
 * Only rendered for studio masters — independent masters never see it.
 */
export function StudioApprovalBanner({ studioName, initialPending }: Props) {
  const { status } = useSaveStatus();
  const [pending, setPending] = useState(initialPending);
  const [justSent, setJustSent] = useState(false);

  // React-blessed "adjust state when an input changes" pattern (render-phase,
  // prev-value tracker) instead of a setState-in-effect: once a save succeeds we
  // latch `pending`/`justSent` so the banner keeps showing the awaiting-approval
  // state even after the transient "saved" status resets to "idle".
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === "saved") {
      setPending(true);
      setJustSent(true);
    }
  }

  const message = justSent
    ? S.sentTemplate.replace("{studio}", studioName)
    : S.infoTemplate.replace("{studio}", studioName);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-text-main">{message}</p>
      </div>
      {pending ? (
        <Badge variant="warning" className="shrink-0">
          {S.pendingBadge}
        </Badge>
      ) : null}
    </div>
  );
}
