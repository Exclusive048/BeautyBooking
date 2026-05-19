import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";
import { SectionCard } from "../section-card";
import type { StudioPolicyData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.policy;

type Props = {
  data: StudioPolicyData;
};

/**
 * Policy section — read-only summary of the Studio Provider's booking
 * rules. The edit UI lives in the existing master-style schedule
 * settings flow (`/cabinet/studio/calendar` → settings drawer pulls
 * the same `applyScheduleSnapshot` path), so we don't fork a second
 * editor here. Surfacing the current values + a deep link keeps the
 * settings page useful without duplicating the editor.
 *
 * `lateCancelAction` stays informational — enforcement is a known
 * backlog item (L3 from master schedule settings; payment-side fines
 * not wired).
 */
export function PolicySection({ data }: Props) {
  return (
    <SectionCard title={T.title} description={T.description}>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Row label={T.minBookingAhead} value={T.hoursTemplate.replace("{hours}", String(data.minBookingHoursAhead))} />
        <Row label={T.maxBookingAhead} value={T.daysTemplate.replace("{days}", String(data.maxBookingDaysAhead))} />
        <Row
          label={T.cancellationDeadline}
          value={
            data.cancellationDeadlineHours !== null
              ? T.hoursTemplate.replace("{hours}", String(data.cancellationDeadlineHours))
              : T.notSet
          }
        />
        <Row label={T.lateCancelAction} value={mapLateAction(data.lateCancelAction)} />
        <Row label={T.acceptNewClients} value={data.acceptNewClients ? T.yes : T.no} />
        <Row label={T.remindersEnabled} value={data.remindersEnabled ? T.yes : T.no} />
      </dl>
      <p className="text-[11px] text-text-sec">
        {T.editHint}{" "}
        <Link
          href="/cabinet/studio/calendar"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {T.editLink}
        </Link>
      </p>
    </SectionCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-input/30 p-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-text-main">{value}</dd>
    </div>
  );
}

function mapLateAction(value: string): string {
  const labels = UI_TEXT.studioCabinet.settingsV2.policy.lateActions;
  if (value === "none") return labels.none;
  if (value === "reminder") return labels.reminder;
  if (value === "fine") return labels.fine;
  return value;
}
