import type { ClientDetailView } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatRelativeDate, formatRubles } from "./lib/format";

const T = UI_TEXT.cabinetMaster.clients.detail.stats;

type Props = {
  client: ClientDetailView;
  now: Date;
};

/**
 * Four equal-weight stat tiles inside the detail card. Each tile is a
 * mono-uppercase eyebrow + display-font value. Empty values render as
 * em-dash so the grid never collapses.
 */
export function ClientDetailStats({ client, now }: Props) {
  return (
    <dl className="grid grid-cols-2 gap-4 border-b border-border-subtle py-4 lg:grid-cols-4">
      <Stat label={T.visits} value={client.visitsCount > 0 ? String(client.visitsCount) : "—"} />
      <Stat label={T.ltv} value={formatRubles(client.totalAmount)} />
      <Stat label={T.avgCheck} value={formatRubles(client.avgCheck)} />
      <Stat
        label={T.next}
        value={
          client.nextBookingAt ? formatRelativeDate(client.nextBookingAt, now) : "—"
        }
      />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {label}
      </dt>
      <dd className="mt-1 font-display text-lg text-text-main">{value}</dd>
    </div>
  );
}
