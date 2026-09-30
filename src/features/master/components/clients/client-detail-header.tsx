import { ChevronLeft, Crown, Mail, Phone, Plus, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ClientStatus } from "@/lib/master/clients-classifier";
import type { ClientDetailView } from "@/lib/master/clients-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { CopyButton } from "./copy-button";
import { formatPhone, formatRelativeDate, getInitials, pickAvatarColor } from "./lib/format";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.cabinetMaster.clients.detail;
const STATUS_T = UI_TEXT.cabinetMaster.clients.status;
const LIST_T = UI_TEXT.cabinetMaster.clients.list;

type Props = {
  client: ClientDetailView;
  /** Mobile back arrow handler — clears the parent's selection state. */
  onBack: () => void;
  now: Date;
};

const SOURCE_LABEL_MAP = {
  marketplace: T.sourceMarketplace,
  manual: T.sourceManual,
  unknown: T.sourceUnknown,
} as const;

// MASTER-MODELS-FIX-A: Russian plural form for "раз" / "раза" / "раз"
// used inside the «Откликался на модельные» tooltip.
function pluralizeApplications(count: number): string {
  const abs = Math.abs(count) % 100;
  const lastDigit = abs % 10;
  if (abs >= 11 && abs <= 14) return T.modelApplicantPluralMany;
  if (lastDigit === 1) return T.modelApplicantPluralOne;
  if (lastDigit >= 2 && lastDigit <= 4) return T.modelApplicantPluralFew;
  return T.modelApplicantPluralMany;
}

const STATUS_TONES: Record<ClientStatus, string> = {
  new: "bg-info-surface text-info-text",
  regular: "bg-success-surface text-success-text",
  vip: "bg-warning-surface text-warning-text",
  sleeping: "bg-muted text-muted-foreground",
};

/**
 * Top of the detail panel. Mobile shows a back arrow ("К списку") above
 * everything else. Desktop hides the back link via `lg:hidden` since
 * the list is always visible to the left.
 *
 * Contact display picks the best-available channel server-side
 * (phone → email → telegram → null) and prints the matching icon.
 * The copy button is hydrated as a client island so the rest of the
 * card stays server-rendered.
 */
export function ClientDetailHeader({ client, onBack, now }: Props) {
  const isVip = client.statuses.includes("vip");
  const phone = client.contactLabel === "phone" ? formatPhone(client.contact) : null;
  const ContactIcon =
    client.contactLabel === "email"
      ? Mail
      : client.contactLabel === "telegram"
        ? Send
        : Phone;
  const contactDisplay = phone ?? client.contact;
  const sinceLabel = client.firstVisitAt
    ? T.sinceTemplate.replace("{date}", formatRelativeDate(client.firstVisitAt, now))
    : null;

  return (
    <header className="space-y-3 border-b border-border-subtle pb-4">
      <Button variant="wrapper"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-text-sec hover:text-text-main lg:hidden"
        aria-label={LIST_T.backToList}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {LIST_T.backToList}
      </Button>

      <div className="flex flex-wrap items-start gap-4">
        <span
          className={cn(
            "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-medium",
            pickAvatarColor(client.key)
          )}
          aria-hidden
        >
          {getInitials(client.displayName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl text-text-main">{client.displayName}</h2>
            {isVip ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-medium text-warning-text">
                <Crown className="h-3 w-3" aria-hidden />
                VIP
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-sec">
            {contactDisplay ? (
              <span className="inline-flex items-center gap-1">
                <ContactIcon className="h-3 w-3" aria-hidden />
                {contactDisplay}
              </span>
            ) : (
              <span className="italic">{T.contactNone}</span>
            )}
            <span aria-hidden className="opacity-50">
              ·
            </span>
            <span>{SOURCE_LABEL_MAP[client.source]}</span>
            {sinceLabel ? (
              <>
                <span aria-hidden className="opacity-50">
                  ·
                </span>
                <span>{sinceLabel}</span>
              </>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {/* MASTER-CLIENTS-FIX-A #7в: surface the underlying
                classifyClient rule via native `title` tooltip so the
                master understands why a client landed in this bucket
                (auto-derived from booking history, not manual). */}
            {client.statuses.map((status) => (
              <span
                key={status}
                className={cn(
                  "inline-flex cursor-help items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  STATUS_TONES[status]
                )}
                title={STATUS_T.tooltips[status]}
              >
                {STATUS_T[status]}
              </span>
            ))}
            {client.customTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-border-subtle bg-bg-input px-2 py-0.5 text-[11px] text-text-main"
              >
                {tag}
              </span>
            ))}
            {/* MASTER-MODELS-FIX-A: «откликался на модельные»
                marker — visible when the client has ≥1 non-confirmed
                ModelApplication to this master's offers. Distinct
                visual (gradient + Sparkles icon) so it doesn't merge
                with the auto-classified status badges above. Tooltip
                explains the count + invites re-engagement — the whole
                point of preserving rejected siblings instead of
                deleting them. */}
            {client.modelApplicationsCount > 0 ? (
              <span
                className="inline-flex cursor-help items-center gap-1 rounded-full bg-brand-gradient px-2 py-0.5 text-[11px] font-medium text-white"
                title={T.modelApplicantTooltipTemplate
                  .replace("{count}", String(client.modelApplicationsCount))
                  .replace(
                    "{plural}",
                    pluralizeApplications(client.modelApplicationsCount),
                  )}
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                {T.modelApplicantBadge}
              </span>
            ) : null}
            {/* MASTER-CLIENTS-FIX-A #7в: tag-editor stays disabled.
                Auto-tagging via `classifyClient` already covers all 4
                buckets (VIP / Постоянная / Новая / Спящая) — manual
                tag assignment is parked in backlog per user decision
                «tags только если нет других вариантов появления». */}
            <Button variant="wrapper"
              aria-disabled
              title={T.addTagDisabled}
              className="inline-flex cursor-not-allowed items-center gap-0.5 rounded-full border border-dashed border-border-subtle px-2 py-0.5 text-[11px] text-text-sec/60"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {T.addTagLabel}
            </Button>
          </div>
        </div>

        {contactDisplay ? (
          <div className="shrink-0">
            <CopyButton value={contactDisplay} />
          </div>
        ) : null}
      </div>

    </header>
  );
}
