import { ChevronLeft, Crown, Mail, Phone, Plus, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ClientDetailView } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { CopyButton } from "./copy-button";
import { formatPhone, formatRelativeDate, getInitials, pickAvatarColor } from "./lib/format";

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

const STATUS_TONES: Record<keyof typeof STATUS_T, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  regular: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  vip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  sleeping: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
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
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-text-sec hover:text-text-main lg:hidden"
        aria-label={LIST_T.backToList}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {LIST_T.backToList}
      </button>

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
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
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
            {client.statuses.map((status) => (
              <span
                key={status}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  STATUS_TONES[status]
                )}
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
            <button
              type="button"
              disabled
              title={T.notes.editComingSoon}
              className="inline-flex cursor-not-allowed items-center gap-0.5 rounded-full border border-dashed border-border-subtle px-2 py-0.5 text-[11px] text-text-sec/60"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {T.addTagLabel}
            </button>
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
