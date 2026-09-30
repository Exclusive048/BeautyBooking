import Link from "next/link";
import { BadgeCheck, Phone, Send, User } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProfileContacts } from "@/lib/master/profile-view.service";
import { isTelegramEnabled, isVkAuthEnabled, isYandexAuthEnabled } from "@/lib/env";
import { PhoneVerifyActions } from "@/features/cabinet/components/phone-verify-actions";
import { PhoneVerifyNotice } from "@/features/cabinet/components/phone-verify-notice";
import * as UI_TEXT from "@/lib/ui/text";
import { EditableFieldRow } from "../editable/editable-field-row";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.cabinetMaster.profile.contacts;

/** Кабинет клиента — единственное место, где привязывается аккаунт (см. шапку). */
const ACCOUNT_LINK_HREF = "/cabinet/profile";

type Props = {
  data: ProfileContacts;
};

/**
 * Contacts section — phone + email are inline-editable (autosave via
 * `PATCH /api/me`). Telegram + VK stay read-only because they sync
 * from the social-login provider on link.
 *
 * PWA-FIX-03 (решение владельца 2026-09-01): у непривязанной строки появилась
 * ссылка «Привязать» на кабинет клиента. Read-only строка без действия читалась
 * как сломанное поле — владелец так её и прочитал, — потому что привязка
 * аккаунта живёт НЕ здесь: VK подключается в `/cabinet/profile`
 * (карточка «Связанные аккаунты»), и другого входа у мастера нет. ⚠️ Это НЕ ссылка на
 * страницу ВКонтакте: та редактируется отдельным полем в секции «Соцсети»
 * (`socialVk`), и две одноимённые строки в одном экране — как раз то, что
 * вызвало путаницу.
 *
 * PHONE-CLAIM-01: до этого `fieldKey="phone"` уходил в `/api/me`, который
 * МОЛЧА отбрасывал ключ (Zod strip после SECURITY-EXPOSURE-AUDIT-01 #2) — поле
 * выглядело редактируемым и не сохранялось. Теперь номер снова принимается,
 * но как ЗАЯВКА без силы (см. lib/auth/phone-claim.ts); ввод идёт под маской
 * «+7 (…)», незавершённый номер не отправляется.
 */
export function ContactsSection({ data }: Props) {
  return (
    <SectionShell anchor="contacts" icon={Phone} title={T.title} subtitle={T.subtitle}>
      <PhoneVerifyNotice className="mb-3" />
      <ul className="divide-y divide-border-subtle">
        <li>
          {/* `mask` — сериализуемый id, не функции: эта секция — RSC (§13). */}
          <EditableFieldRow
            label={T.phoneLabel}
            value={data.phone ?? ""}
            fieldKey="phone"
            apiPath="/api/me"
            placeholder={T.phonePlaceholder}
            maxLength={18}
            mask="phone"
          />
          {/* PHONE-OAUTH-PROOF-01: SMS в проде нет — номер подтверждается через
              аккаунт ВКонтакте / Яндекс ID, к которому он привязан. */}
          {data.phoneVerified ? (
            <p className="flex items-center gap-1.5 pb-3 text-xs text-success-text">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              {T.phoneVerifiedLabel}
            </p>
          ) : (
            <PhoneVerifyActions
              providers={{ vk: isVkAuthEnabled, yandex: isYandexAuthEnabled }}
              className="pb-3"
            />
          )}
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
        {/* FIX-TELEGRAM-KILLSWITCH: Telegram contact row absent when off. */}
        {isTelegramEnabled && (
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
            linkHref={ACCOUNT_LINK_HREF}
          />
        )}
        <ReadonlyRow
          icon={User}
          label={T.vkLabel}
          value={data.vkConnected ? `id${data.vkUserId ?? ""}`.trim() : null}
          verified={data.vkConnected}
          linkHref={ACCOUNT_LINK_HREF}
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
  linkHref,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null;
  verified: boolean;
  /** Куда вести за привязкой. Ссылка показывается только у непривязанной строки. */
  linkHref?: string;
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
          className="inline-flex items-center gap-1 rounded-full bg-success-surface px-2 py-0.5 text-[10px] text-success-text"
          aria-label={T.verifiedLabel}
        >
          <BadgeCheck className="h-3 w-3" aria-hidden />
          {T.verifiedLabel}
        </span>
      ) : linkHref ? (
        <Link
          href={linkHref}
          // `aria-label` — потому что «Привязать» ×2 в одном списке неразличимы
          // на слух: ротор читает ссылки вне контекста строки.
          aria-label={`${T.linkAction} — ${label}`}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-accent-text transition-colors hover:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {T.linkAction}
        </Link>
      ) : null}
    </li>
  );
}
