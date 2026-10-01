import { Phone } from "lucide-react";
import { EditableFieldRow } from "@/features/master/components/profile/editable/editable-field-row";
import type { MasterAccountIdentity } from "@/lib/master/account-view.service";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.security;
const TC = UI_TEXT.cabinetMaster.profile.contacts;

type Props = {
  identity: MasterAccountIdentity;
};

/**
 * Phone + email identity card.
 *
 * Phone is **read-only** here (SECURITY-EXPOSURE-AUDIT-01 #2): it is the login
 * identity and the key guest bookings + studio invites match on, so it must not
 * be writable without OTP verification. `PATCH /api/me` no longer accepts it;
 * the number is set at signup via the SMS OTP flow. A verified change flow is
 * tracked in BACKLOG (PHONE-CHANGE-VERIFIED-FLOW). Email stays inline-editable
 * via `/api/me`, which now resets verification on any change.
 */
export function IdentityCard({ identity }: Props) {
  const phoneValue = identity.phone?.trim();
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-base text-text-main">{T.identityHeading}</h2>
      <ul className="mt-2 divide-y divide-border-subtle">
        <li>
          <div className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <span className="eyebrow">
                {T.phoneLabel}
              </span>
              <p className={phoneValue ? "mt-1 text-sm text-text-main" : "mt-1 text-sm italic text-text-sec"}>
                {phoneValue || T.notSetLabel}
              </p>
            </div>
          </div>
        </li>
        <li>
          <EditableFieldRow
            label={T.emailLabel}
            value={identity.email ?? ""}
            fieldKey="email"
            apiPath="/api/me"
            placeholder={TC.emailPlaceholder}
            maxLength={120}
          />
        </li>
      </ul>
      <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-text-sec">
        <Phone className="mt-0.5 h-3 w-3 shrink-0" aria-hidden strokeWidth={1.8} />
        <span>{TC.phoneVerifyHint}</span>
      </p>
    </section>
  );
}
