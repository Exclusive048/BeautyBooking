import { BadgeCheck, Phone, Send, User } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProfileContacts } from "@/lib/master/profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { EditableFieldRow } from "../editable/editable-field-row";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.cabinetMaster.profile.contacts;

type Props = {
  data: ProfileContacts;
};

/**
 * Contacts section — phone + email are inline-editable (autosave via
 * `PATCH /api/me`). Telegram + VK stay read-only because they sync
 * from the social-login provider on link.
 *
 * fix-02: phone + email moved from read-only chips to
 * `<EditableFieldRow>`. Phone changes still ship **without** OTP
 * verification — pre-launch blocker tracked in BACKLOG. The footnote
 * documents the SMS-pending state.
 */
export function ContactsSection({ data }: Props) {
  return (
    <SectionShell anchor="contacts" icon={Phone} title={T.title} subtitle={T.subtitle}>
      <ul className="divide-y divide-border-subtle">
        <li>
          <EditableFieldRow
            label={T.phoneLabel}
            value={data.phone ?? ""}
            fieldKey="phone"
            apiPath="/api/me"
            placeholder={T.phonePlaceholder}
            maxLength={40}
          />
        </li>
        <li>
          <EditableFieldRow
            label={T.emailLabel}
            value={data.email ?? ""}
            fieldKey="email"
            apiPath="/api/me"
            placeholder={T.emailPlaceholder}
            maxLength={120}
          />
        </li>
        <ReadonlyRow
          icon={Send}
          label={T.telegramLabel}
          value={
            data.telegramUsername
              ? `@${data.telegramUsername}`
              : data.telegramConnected
                ? T.connectedLabel
                : null
          }
          verified={data.telegramConnected}
        />
        <ReadonlyRow
          icon={User}
          label={T.vkLabel}
          value={data.vkConnected ? `id${data.vkUserId ?? ""}`.trim() : null}
          verified={data.vkConnected}
        />
      </ul>
      <p className="mt-3 text-xs text-text-sec">{T.phoneVerifyHint}</p>
    </SectionShell>
  );
}

function ReadonlyRow({
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
            isEmpty ? "italic text-text-sec" : "text-text-main",
          )}
        >
          {isEmpty ? T.notSetLabel : value}
        </p>
      </div>
      {verified ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          aria-label={T.verifiedLabel}
        >
          <BadgeCheck className="h-3 w-3" aria-hidden />
          {T.verifiedLabel}
        </span>
      ) : null}
    </li>
  );
}
