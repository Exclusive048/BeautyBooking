import { Phone } from "lucide-react";
import { EditableFieldRow } from "@/features/master/components/profile/editable/editable-field-row";
import type { MasterAccountIdentity } from "@/lib/master/account-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.security;
const TC = UI_TEXT.cabinetMaster.profile.contacts;

type Props = {
  identity: MasterAccountIdentity;
};

/**
 * Phone + email inline-editable card (fix-02).
 *
 * Mirrors the editable rows on the profile contacts section — both
 * paths PATCH `/api/me`, last write wins. The legacy disabled
 * «Скоро · потребуется подтверждение» button was removed; the
 * SMS-verify gap is documented in a single honest hint at the bottom.
 * Pre-launch blocker tracked in BACKLOG.
 */
export function IdentityCard({ identity }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-base text-text-main">{T.identityHeading}</h2>
      <ul className="mt-2 divide-y divide-border-subtle">
        <li>
          <EditableFieldRow
            label={T.phoneLabel}
            value={identity.phone ?? ""}
            fieldKey="phone"
            apiPath="/api/me"
            placeholder={TC.phonePlaceholder}
            maxLength={40}
          />
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
