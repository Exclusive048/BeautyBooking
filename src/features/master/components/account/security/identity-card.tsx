import { AtSign, BadgeCheck, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MasterAccountIdentity } from "@/lib/master/account-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.security;

type Props = {
  identity: MasterAccountIdentity;
};

/**
 * Phone + email — both **read-only** in this commit. Existing
 * `/api/me PATCH` accepts phone updates without OTP verification of
 * the new number, which is a security gap (see BACKLOG: "Phone change
 * OTP flow"). Until the secure flow ships, the master sees a disabled
 * "Изменить" button with a "Скоро" tooltip.
 *
 * Email is also gated for now — `<EmailNotificationsSection>` on the
 * notifications tab already handles email change end-to-end (it's a
 * single channel-scoped flow), so we don't duplicate it here.
 */
export function IdentityCard({ identity }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-base text-text-main">{T.identityHeading}</h2>
      <ul className="mt-4 divide-y divide-border-subtle">
        <Row icon={Phone} label={T.phoneLabel} value={identity.phone} verified={Boolean(identity.phone)} />
        <Row icon={AtSign} label={T.emailLabel} value={identity.email} verified={Boolean(identity.email)} />
      </ul>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  verified,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null;
  verified: boolean;
}) {
  const isEmpty = !value || value.trim().length === 0;
  return (
    <li className="flex items-center gap-3 py-3">
      <Icon className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 text-sm",
            isEmpty ? "italic text-text-sec" : "text-text-main"
          )}
        >
          {isEmpty ? T.notSetLabel : value}
        </p>
      </div>
      {verified ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          aria-label={T.verifiedBadge}
        >
          <BadgeCheck className="h-3 w-3" aria-hidden />
          {T.verifiedBadge}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        disabled
        title={T.changeSoonHint}
        className="shrink-0"
      >
        {T.changeSoonHint}
      </Button>
    </li>
  );
}
