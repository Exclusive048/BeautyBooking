"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  Calendar,
  Check,
  CheckCircle2,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FocalImage } from "@/components/ui/focal-image";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  ProfileDTO,
  ProfileUpdatePatch,
} from "@/lib/client-cabinet/profile.service";
import {
  formatConnectedAt,
  formatMemberSince,
  formatVisitsLabel,
} from "./lib/format-helpers";
import {
  useProfileAutosave,
  type SaveStatus,
} from "./hooks/use-profile-autosave";
import { EmailVerifyModal } from "./modals/email-verify-modal";
import { TelegramConnectModal } from "./modals/telegram-connect-modal";

const T = UI_TEXT.clientCabinet.profilePage;

type Props = {
  /** Server-loaded user id needed for the AvatarEditor (entityType=USER). */
  userId: string;
};

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(async (res) => {
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "load_failed");
    return json.data as ProfileDTO;
  });

export function ClientProfilePage({ userId }: Props) {
  const { data, mutate, isLoading, error } = useSWR<ProfileDTO>(
    "/api/cabinet/user/profile",
    fetcher,
  );
  const [stubMessage, setStubMessage] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [tgModalOpen, setTgModalOpen] = useState(false);

  const { status, scheduleSave } = useProfileAutosave({
    onSaved: (next) => {
      void mutate(next, { revalidate: false });
    },
  });

  function applyPatch(patch: Partial<ProfileUpdatePatch>) {
    if (!data) return;
    // Optimistic merge into local view so inputs feel responsive.
    const next: ProfileDTO = {
      ...data,
      personal: {
        ...data.personal,
        ...(patch.firstName !== undefined
          ? { firstName: patch.firstName ?? null }
          : {}),
        ...(patch.lastName !== undefined
          ? { lastName: patch.lastName ?? null }
          : {}),
        ...(patch.city !== undefined ? { city: patch.city ?? null } : {}),
        ...(patch.birthDate !== undefined
          ? { birthDate: patch.birthDate ?? null }
          : {}),
        ...(patch.hideAgeYear !== undefined
          ? { hideAgeYear: patch.hideAgeYear }
          : {}),
      },
      contacts: {
        ...data.contacts,
        ...(patch.email !== undefined ? { email: patch.email ?? null } : {}),
      },
    };
    void mutate(next, { revalidate: false });
    scheduleSave(patch);
  }

  if (error) {
    return (
      <Card className="p-6 text-center text-sm text-text-sec">
        {UI_TEXT.common.blockLoadFailed}
      </Card>
    );
  }
  if (isLoading || !data) {
    return <ProfileSkeleton />;
  }

  async function handleTelegramUnlink() {
    const res = await fetch("/api/auth/telegram/unlink", {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) void mutate();
  }

  async function handleVkUnlink() {
    const res = await fetch("/api/auth/vk/unlink", {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) void mutate();
  }

  function handleVkConnect() {
    window.location.href = "/api/auth/vk/start";
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <ProfileHeaderCard
          data={data}
          status={status}
          userId={userId}
          onAvatarChanged={() => void mutate()}
        />

        <PersonalCard data={data} onPatch={applyPatch} />

        <ContactsCard
          data={data}
          onPatch={applyPatch}
          onEmailVerify={() => setEmailModalOpen(true)}
        />

        <LinkedAccountsCard
          data={data}
          onTelegramConnect={() => setTgModalOpen(true)}
          onTelegramUnlink={handleTelegramUnlink}
          onVkConnect={handleVkConnect}
          onVkUnlink={handleVkUnlink}
        />

        <DangerZoneCard
          onDelete={() =>
            setStubMessage("Удаление аккаунта — в следующем спринте")
          }
        />

        {stubMessage ? (
          <div
            role="status"
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border-subtle bg-bg-card px-4 py-2 text-sm text-text-main shadow-card"
          >
            {stubMessage}
            <button
              type="button"
              onClick={() => setStubMessage(null)}
              className="ml-3 text-text-sec hover:text-text-main"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <CompletionGradientCard completion={data.completion} />
        <ChecklistCard items={data.completion.items} />
        <TipCard />
      </aside>

      {emailModalOpen ? (
        <EmailVerifyModal
          key="email-modal"
          currentEmail={data.contacts.email}
          onClose={() => setEmailModalOpen(false)}
          onSuccess={() => {
            setEmailModalOpen(false);
            void mutate();
          }}
        />
      ) : null}

      {tgModalOpen ? (
        <TelegramConnectModal
          key="tg-modal"
          onClose={() => setTgModalOpen(false)}
          onSuccess={() => {
            setTgModalOpen(false);
            void mutate();
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

function ProfileHeaderCard({
  data,
  status,
  userId,
  onAvatarChanged: _onAvatarChanged,
}: {
  data: ProfileDTO;
  status: SaveStatus;
  userId: string;
  onAvatarChanged: () => void;
}) {
  const displayName =
    [data.personal.firstName, data.personal.lastName].filter(Boolean).join(" ") ||
    "Клиент";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0">
          {/*
            Reuse the shared AvatarEditor — same component the master cabinet
            uses, kind=AVATAR + entityType=USER. The editor handles upload +
            crop + delete via /api/media; we don't need a parallel pipeline.
          */}
          <AvatarEditor
            entityType="USER"
            entityId={userId}
            fallbackUrl={data.avatar.url}
            sizeClassName="h-[72px] w-[72px]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-display text-xl text-text-main">{displayName}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-sec">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden />
              С нами с {formatMemberSince(data.stats.memberSince)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {formatVisitsLabel(data.stats.visitsCount)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3 text-primary" aria-hidden />
              {data.stats.favoritesCount} в избранном
            </span>
          </div>
        </div>

        <SaveStatusIndicator status={status} />
      </div>
    </Card>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const config = {
    saving: { color: "text-amber-600 dark:text-amber-400", label: T.saveStatus.saving },
    saved: { color: "text-emerald-600 dark:text-emerald-400", label: T.saveStatus.saved },
    error: { color: "text-rose-600 dark:text-rose-400", label: T.saveStatus.error },
  }[status];
  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono text-xs ${config.color}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {config.label}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Personal                                                                   */
/* -------------------------------------------------------------------------- */

function PersonalCard({
  data,
  onPatch,
}: {
  data: ProfileDTO;
  onPatch: (p: Partial<ProfileUpdatePatch>) => void;
}) {
  return (
    <Card className="p-6">
      <SectionHeader
        title={T.sections.personal}
        subtitle="Эти данные видят только мастера, у которых вы были на приёме."
      />

      <FieldRow label={T.fields.firstName}>
        <Input
          value={data.personal.firstName ?? ""}
          onChange={(e) => onPatch({ firstName: e.target.value })}
          placeholder={T.fields.firstNamePlaceholder}
        />
      </FieldRow>

      <FieldRow label={T.fields.lastName}>
        <Input
          value={data.personal.lastName ?? ""}
          onChange={(e) => onPatch({ lastName: e.target.value })}
          placeholder={T.fields.lastNamePlaceholder}
        />
      </FieldRow>

      <FieldRow
        label={T.fields.city}
        hint="Помогает подбирать мастеров поблизости."
      >
        <Input
          value={data.personal.city ?? ""}
          onChange={(e) => onPatch({ city: e.target.value })}
          placeholder={T.fields.cityPlaceholder}
        />
      </FieldRow>

      <FieldRow
        label={T.fields.birthDate}
        hint="Для скидок и сюрпризов в день рождения."
        last
      >
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="date"
            value={data.personal.birthDate ?? ""}
            onChange={(e) =>
              onPatch({ birthDate: e.target.value || null })
            }
            className="w-[180px]"
          />
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-main">
            <Switch
              checked={data.personal.hideAgeYear}
              onCheckedChange={(v) => onPatch({ hideAgeYear: v })}
            />
            {T.fields.hideAgeYear}
          </label>
        </div>
      </FieldRow>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                   */
/* -------------------------------------------------------------------------- */

function ContactsCard({
  data,
  onPatch,
  onEmailVerify,
}: {
  data: ProfileDTO;
  onPatch: (p: Partial<ProfileUpdatePatch>) => void;
  onEmailVerify: () => void;
}) {
  return (
    <Card className="p-6">
      <SectionHeader
        title={T.sections.contacts}
        subtitle="Канал, по которому мастер с вами свяжется."
      />

      <FieldRow
        label={T.fields.phone}
        hint="Для входа и СМС-напоминаний."
        action={
          data.contacts.phoneVerified ? (
            <Badge variant="success">
              <Check className="mr-0.5 h-3 w-3" aria-hidden />
              {T.fields.phoneVerified}
            </Badge>
          ) : null
        }
      >
        <div className="relative">
          <Phone
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
            aria-hidden
          />
          <Input value={data.contacts.phone ?? ""} disabled className="pl-9" />
        </div>
      </FieldRow>

      <FieldRow
        label={T.fields.email}
        hint="Для чеков и подтверждений."
        last
        action={
          data.contacts.emailVerified ? (
            <Badge variant="success">
              <Check className="mr-0.5 h-3 w-3" aria-hidden />
              {T.fields.emailVerified}
            </Badge>
          ) : data.contacts.email ? (
            <Button variant="secondary" size="sm" onClick={onEmailVerify}>
              <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {T.fields.emailVerify}
            </Button>
          ) : null
        }
      >
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
            aria-hidden
          />
          <Input
            type="email"
            value={data.contacts.email ?? ""}
            onChange={(e) => onPatch({ email: e.target.value || null })}
            placeholder={T.fields.emailPlaceholder}
            className="pl-9"
          />
        </div>
      </FieldRow>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Linked accounts                                                            */
/* -------------------------------------------------------------------------- */

function LinkedAccountsCard({
  data,
  onTelegramConnect,
  onTelegramUnlink,
  onVkConnect,
  onVkUnlink,
}: {
  data: ProfileDTO;
  onTelegramConnect: () => void;
  onTelegramUnlink: () => void;
  onVkConnect: () => void;
  onVkUnlink: () => void;
}) {
  const tg = data.linked.telegram;
  const vk = data.linked.vk;
  return (
    <Card className="p-6">
      <SectionHeader
        title={T.sections.linkedAccounts}
        subtitle="Для быстрого входа и связи с мастером."
      />

      <div className="space-y-2.5">
        <ConnectRow
          icon={<MessageCircle className="h-5 w-5" aria-hidden />}
          iconColor="#2AABEE"
          name="Telegram"
          connected={tg.connected}
          status={
            tg.connected
              ? tg.username
                ? `@${tg.username} · подключён ${formatConnectedAt(tg.connectedAt)}`
                : `подключён ${formatConnectedAt(tg.connectedAt)}`
              : "Войти через Telegram и получать уведомления"
          }
          actionLabel={tg.connected ? T.linkedAccounts.telegramDisconnect : T.linkedAccounts.telegramConnect}
          onAction={tg.connected ? onTelegramUnlink : onTelegramConnect}
        />
        <ConnectRow
          icon={<Users className="h-5 w-5" aria-hidden />}
          iconColor="#0077FF"
          name="VKontakte"
          connected={vk.connected}
          status={
            vk.connected
              ? `подключён ${formatConnectedAt(vk.connectedAt)}`
              : "Войти через VK и получать уведомления"
          }
          actionLabel={vk.connected ? T.linkedAccounts.vkDisconnect : T.linkedAccounts.vkConnect}
          onAction={vk.connected ? onVkUnlink : onVkConnect}
        />
      </div>
    </Card>
  );
}

function ConnectRow({
  icon,
  iconColor,
  name,
  connected,
  status,
  actionLabel,
  onAction,
  disabledAction,
  disabledHint,
}: {
  icon: ReactNode;
  iconColor: string;
  name: string;
  connected: boolean;
  status: string;
  actionLabel: string;
  onAction?: () => void;
  disabledAction?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-subtle bg-bg-card p-3.5">
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white"
        style={{ backgroundColor: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-main">{name}</div>
        <div className="mt-0.5 truncate text-xs text-text-sec">{status}</div>
      </div>
      <Button
        variant={connected ? "ghost" : "secondary"}
        size="sm"
        onClick={onAction}
        disabled={disabledAction}
        title={disabledHint}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Danger zone                                                                */
/* -------------------------------------------------------------------------- */

function DangerZoneCard({ onDelete }: { onDelete: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-main">
            {T.danger.cardTitle}
          </div>
          <div className="mt-1 text-xs text-text-sec">
            {T.danger.cardDescription}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
        >
          {T.danger.cardCta}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Right rail                                                                 */
/* -------------------------------------------------------------------------- */

function CompletionGradientCard({
  completion,
}: {
  completion: ProfileDTO["completion"];
}) {
  const total = 6;
  const done = Object.values(completion.items).filter(Boolean).length;
  return (
    <Card className="overflow-hidden border-0 bg-brand-gradient p-5 text-white">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/80">
        {T.completion.rail}
      </div>
      <div className="my-1 font-display text-4xl">{completion.percent}%</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
        <div
          className="h-full bg-white transition-all duration-500"
          style={{ width: `${completion.percent}%` }}
        />
      </div>
      <div className="mt-2.5 text-xs text-white/85">
        {T.completion.ofTotal(done, total)}
      </div>
    </Card>
  );
}

const CHECKLIST_ROWS: Array<{
  key: keyof ProfileDTO["completion"]["items"];
  label: string;
}> = [
  { key: "nameLastname", label: "Имя и фамилия" },
  { key: "phoneVerified", label: T.completion.items.phone },
  { key: "emailVerified", label: T.completion.items.email },
  { key: "birthday", label: T.completion.items.birthDate },
  { key: "tgLinked", label: T.completion.items.telegram },
  { key: "vkLinked", label: T.completion.items.vk },
];

function ChecklistCard({
  items,
}: {
  items: ProfileDTO["completion"]["items"];
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 text-sm font-semibold text-text-main">
        {T.completion.checklistTitle}
      </div>
      {CHECKLIST_ROWS.map((row) => {
        const done = items[row.key];
        return (
          <div
            key={row.key}
            className="flex items-center gap-2.5 py-1.5 text-sm"
          >
            <span
              className={`grid h-[18px] w-[18px] place-items-center rounded-full ${
                done ? "bg-primary text-white" : "bg-bg-input"
              }`}
            >
              {done ? (
                <Check className="h-3 w-3" aria-hidden strokeWidth={2.5} />
              ) : null}
            </span>
            <span
              className={
                done ? "text-text-sec line-through" : "text-text-main"
              }
            >
              {row.label}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

function TipCard() {
  return (
    <Card className="p-5">
      <div className="mb-1 text-sm font-semibold text-text-main">
        {T.completion.tipTitle}
      </div>
      <div className="text-xs leading-relaxed text-text-sec">
        {T.completion.tipDescription}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Common                                                                     */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3">
      <div className="font-display text-base text-text-main">{title}</div>
      <div className="mt-0.5 text-xs text-text-sec">{subtitle}</div>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  action,
  children,
  last,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 items-center gap-4 py-4 md:grid-cols-[180px_1fr_auto] ${
        last ? "" : "border-b border-border-subtle"
      }`}
    >
      <div>
        <div className="text-sm font-medium text-text-main">{label}</div>
        {hint ? (
          <div className="mt-0.5 text-xs text-text-sec">{hint}</div>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
      <div className="flex items-center justify-end">{action}</div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-48 animate-pulse bg-bg-input/40" />
        ))}
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="h-32 animate-pulse bg-bg-input/40" />
        ))}
      </div>
    </div>
  );
}

// Suppress lint hint about unused imports leftover from the consolidation —
// `FocalImage` + `Textarea` may be re-introduced when photo previews / email
// modals land. Mark as referenced explicitly.
export const _ProfileImports = { FocalImage, Textarea, MapPin };
