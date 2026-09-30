"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { ResilientImage } from "@/components/ui/resilient-image";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import {
  formatRussianPhoneInput,
  formatRussianPhoneInputOnChange,
  isCompleteRussianPhoneInput,
} from "@/lib/phone/input-format";
import type {
  ProfileDTO,
  ProfileUpdatePatch,
} from "@/lib/client-cabinet/profile.service";
import {
  formatConnectedAt,
  formatMemberSince,
  formatVisitsLabel,
} from "./lib/format-helpers";
import { mergeSavedProfile } from "./lib/merge-saved-profile";
import {
  useProfileAutosave,
  type SaveStatus,
} from "./hooks/use-profile-autosave";
import { EmailVerifyModal } from "./modals/email-verify-modal";
import {
  PhoneVerifyActions,
  type PhoneVerifyProviders,
} from "@/features/cabinet/components/phone-verify-actions";
import { PhoneVerifyNotice } from "@/features/cabinet/components/phone-verify-notice";
import { SetupGuideProfileCard } from "@/features/cabinet/setup-guide/setup-guide-profile-card";
import type { SetupGuideDto } from "@/lib/onboarding/setup-guide-shared";
import { TelegramConnectModal } from "./modals/telegram-connect-modal";
import { isTelegramEnabled } from "@/lib/env.client";

const T = UI_TEXT.clientCabinet.profilePage;
// FIX-D1: исходы стартовой ноги VK — те же строки, что у студийного кабинета.
const vkStartText = UI_TEXT.settings.vk.connectFailure;

type Props = {
  /** Server-loaded user id needed for the AvatarEditor (entityType=USER). */
  userId: string;
  /**
   * Server-resolved SMTP gate (`isEmailConfigured()`). When false the platform
   * physically cannot send the verification code, so the affordance is hidden
   * rather than offered as a dead end — the same treatment `/login` gives its
   * email tab and the VK/Yandex/Telegram buttons. The route itself already
   * fail-closes with 503 `SYSTEM_FEATURE_DISABLED`; this is the UI half.
   */
  emailEnabled?: boolean;
  /**
   * FIX-EXTERNAL-GATING-01 (G-3): server-resolved `isVkAuthEnabled` (needs the
   * server-only `VK_CLIENT_ID`, so the client can't compute it). Gates the VK
   * *connect* affordance in the linked-accounts card. Disconnect for a still-
   * linked account is NEVER gated — a user must always be able to detach a
   * provider that's been switched off.
   */
  vkAuthEnabled?: boolean;
  /** PHONE-OAUTH-PROOF-01: server-resolved `isYandexAuthEnabled` — кнопка «Подтвердить через Яндекс ID». */
  yandexAuthEnabled?: boolean;
  /** SETUP-GUIDE-01: «Первые шаги» кабинетов мастера / студии; пусто — раздела нет. */
  setupGuides?: SetupGuideDto[];
};

const fetcher = (url: string) =>
  fetchJsonWithAuth<ProfileDTO>(url);

type TelegramConnectToast = { tone: "success" | "error"; text: string };

const profileText = UI_TEXT.clientCabinet.profile;

// FIX-24 (Item 2b): map the redirect-mode connect result (`?telegram=…`) to a toast.
function telegramConnectResult(value: string | null): TelegramConnectToast | null {
  switch (value) {
    case "connected":
      return { tone: "success", text: profileText.telegramConnected };
    case "conflict":
      return { tone: "error", text: profileText.telegramConflict };
    case "unconfigured":
      return { tone: "error", text: profileText.telegramUnconfigured };
    case "error":
      return { tone: "error", text: profileText.telegramConnectFailed };
    default:
      return null;
  }
}

/**
 * FIX-D1 — исход стартовой ноги VK → текст. Близнец `telegramConnectResult`
 * выше и намеренно той же формы: оба читают флаг, который навигация оставила в
 * адресе. С 29.09 доработки · 10 итог показывает общий тост из эффекта, который
 * и чистит адрес (состояния страницы тост не трогает).
 */
function vkConnectFailureMessage(value: string | null): string | null {
  switch (value) {
    case "provider_unavailable":
      return vkStartText.providerUnavailable;
    case "start_failed":
      return vkStartText.startFailed;
    case "consent_required":
      return vkStartText.consentRequired;
    default:
      return null;
  }
}

export function ClientProfilePage({
  userId,
  emailEnabled = false,
  vkAuthEnabled = false,
  yandexAuthEnabled = false,
  setupGuides = [],
}: Props) {
  const { data, mutate, isLoading, error } = useSWR<ProfileDTO>(
    "/api/cabinet/user/profile",
    fetcher,
  );
  const searchParams = useSearchParams();
  const toast = useToast();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [tgModalOpen, setTgModalOpen] = useState(false);

  // FIX-24 (Item 2b) / FIX-D1: подключение Telegram и отказ подключения VK
  // возвращаются сюда флагом в адресе (`?telegram=` / `?vk=`). Прочитать один
  // раз, показать общим тостом (29.09 доработки · 10 — прежние плавающие плашки
  // садились на нижнюю навигацию телефона) и снять флаг, чтобы обновление
  // страницы не показало итог повторно. Ref переживает двойной вызов эффекта в
  // StrictMode. Состояние «подключено» приходит свежими данными после
  // полной навигации.
  const navResultShown = useRef(false);
  useEffect(() => {
    if (navResultShown.current) return;
    navResultShown.current = true;
    const vkFailure = vkConnectFailureMessage(searchParams.get("vk"));
    if (vkFailure) toast.error(vkFailure);
    const tgResult = telegramConnectResult(searchParams.get("telegram"));
    if (tgResult) {
      if (tgResult.tone === "success") toast.success(tgResult.text);
      else toast.error(tgResult.text);
    }
    if (searchParams.get("telegram") || searchParams.get("vk")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams, toast]);


  const { status, errorMessage, scheduleSave } = useProfileAutosave({
    // PWA-RELOAD-01: поля ввода остаются локальными, от сервера — вычисляемое
    // (см. `mergeSavedProfile`), иначе ответ сейва перетирал набираемый текст.
    onSaved: (next) => {
      void mutate((current) => mergeSavedProfile(next, current), { revalidate: false });
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
        // PHONE-CLAIM-01: оптимистично едет отформатированная строка; сервер
        // вернёт канон +7XXXXXXXXXX, а маска идемпотентна к обоим видам.
        // Смена номера — заявка, бейдж владения гаснет сразу.
        ...(patch.phone !== undefined
          ? { phone: patch.phone ?? null, phoneVerified: false }
          : {}),
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
    try {
      await fetchJsonWithAuth<unknown>("/api/auth/telegram/unlink", {
        method: "POST",
        credentials: "include",
      });
      void mutate();
    } catch (error) {
      toast.error(serverMessageOr(error, profileText.unlinkFailed));
    }
  }

  async function handleVkUnlink() {
    try {
      await fetchJsonWithAuth<unknown>("/api/auth/vk/unlink", {
        method: "POST",
        credentials: "include",
      });
      void mutate();
    } catch (error) {
      // «Это единственный способ входа» и т.п. — дословно (раньше молча).
      toast.error(serverMessageOr(error, profileText.unlinkFailed));
    }
  }

  function handleVkConnect() {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- route handler OAuth (редирект к VK), не страница
    window.location.href = "/api/auth/vk/start";
  }


  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <ProfileHeaderCard
          data={data}
          status={status}
          statusMessage={errorMessage}
          userId={userId}
          onAvatarChanged={() => void mutate()}
        />

        <PersonalCard data={data} onPatch={applyPatch} />

        <ContactsCard
          data={data}
          onPatch={applyPatch}
          emailEnabled={emailEnabled}
          onEmailVerify={() => setEmailModalOpen(true)}
          phoneVerifyProviders={{ vk: vkAuthEnabled, yandex: yandexAuthEnabled }}
        />

        <LinkedAccountsCard
          data={data}
          vkAuthEnabled={vkAuthEnabled}
          onTelegramConnect={() => setTgModalOpen(true)}
          onTelegramUnlink={handleTelegramUnlink}
          onVkConnect={handleVkConnect}
          onVkUnlink={handleVkUnlink}
        />

        {setupGuides.length > 0 ? <SetupGuideProfileCard guides={setupGuides} /> : null}

        <DangerZoneCard />

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

      {isTelegramEnabled && tgModalOpen ? (
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
  statusMessage,
  userId,
}: {
  data: ProfileDTO;
  status: SaveStatus;
  /** FIX-C8: курируемая строка сервера для `status === "error"` (см. хук). */
  statusMessage?: string | null;
  userId: string;
  // `onAvatarChanged` is accepted for the caller's contract but unused here:
  // <AvatarEditor> owns its full upload/reload pipeline (self-contained), so the
  // parent doesn't need a change callback. Kept in the type so the wiring is
  // discoverable if AvatarEditor later exposes an onChange.
  onAvatarChanged?: () => void;
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
              <Heart className="h-3 w-3 text-accent-text" aria-hidden />
              {data.stats.favoritesCount} в избранном
            </span>
          </div>
        </div>

        <SaveStatusIndicator status={status} message={statusMessage} />
      </div>
    </Card>
  );
}

function SaveStatusIndicator({
  status,
  message,
}: {
  status: SaveStatus;
  message?: string | null;
}) {
  if (status === "idle") return null;
  const config = {
    saving: { color: "text-warning-text", label: T.saveStatus.saving },
    saved: { color: "text-success-text", label: T.saveStatus.saved },
    error: { color: "text-danger-text", label: T.saveStatus.error },
  }[status];
  // FIX-C8: на ошибке индикатор печатает курируемую строку сервера, если она
  // пришла («Этот email уже используется другим аккаунтом…»), и свой канон —
  // если нет. `role="alert"` только у отказа: «Сохраняем»/«Сохранено» — это
  // фон, а не событие, о котором надо объявлять.
  const label = status === "error" && message ? message : config.label;
  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono text-xs ${config.color}`}
      {...(status === "error" ? { role: "alert" as const } : {})}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {label}
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
        subtitle={T.sectionHints.personal}
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
  emailEnabled,
  onEmailVerify,
  phoneVerifyProviders,
}: {
  data: ProfileDTO;
  onPatch: (p: Partial<ProfileUpdatePatch>) => void;
  emailEnabled: boolean;
  onEmailVerify: () => void;
  phoneVerifyProviders: PhoneVerifyProviders;
}) {
  return (
    <Card className="p-6">
      <SectionHeader
        title={T.sections.contacts}
        subtitle={T.sectionHints.contacts}
      />

      <PhoneVerifyNotice className="mb-4" />

      <FieldRow
        label={T.fields.phone}
        hint={T.fields.phoneHint}
        action={
          data.contacts.phoneVerified ? (
            <Badge variant="success">
              <Check className="mr-0.5 h-3 w-3" aria-hidden />
              {T.fields.phoneVerified}
            </Badge>
          ) : null
        }
      >
        <PhoneField
          value={data.contacts.phone}
          onPatch={onPatch}
        />
        {/* PHONE-OAUTH-PROOF-01: SMS в проде нет — подтверждаем номер через
            аккаунт, к которому он привязан. */}
        {data.contacts.phoneVerified ? null : (
          <PhoneVerifyActions providers={phoneVerifyProviders} className="mt-3" />
        )}
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
          ) : // `emailEnabled === false` → SMTP isn't configured, so the code can
          // never arrive. Don't offer the button at all (see Props.emailEnabled).
          data.contacts.email && emailEnabled ? (
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

/**
 * PHONE-CLAIM-01 — редактируемый телефон с прогрессивной маской «+7 (…)».
 *
 * Сохраняется через общий автосейв страницы, но ТОЛЬКО когда номер полный
 * (10 цифр) либо поле очищено: debounce 700 мс переживает паузу набора, и без
 * этого гейта каждый недобранный номер уезжал бы PATCH'ем и мигал ошибкой
 * валидации. Незавершённый ввод живёт в локальном черновике с подсказкой.
 */
function PhoneField({
  value,
  onPatch,
}: {
  value: string | null;
  onPatch: (p: Partial<ProfileUpdatePatch>) => void;
}) {
  const hintId = useId();
  const [draft, setDraft] = useState(() => formatRussianPhoneInput(value ?? ""));

  // Синхронизация с сервером во время рендера (React 19, паттерн
  // EditableFieldRow): внешнее значение меняется только нашим же optimistic-
  // мержем или ревалидацией — незавершённый черновик оно не перетирает,
  // потому что при наборе `value` не меняется вовсе.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    const formatted = formatRussianPhoneInput(value ?? "");
    if (formatted !== draft) setDraft(formatted);
  }

  const incomplete = draft !== "" && !isCompleteRussianPhoneInput(draft);

  function handleChange(raw: string) {
    const next = formatRussianPhoneInputOnChange(draft, raw);
    setDraft(next);
    if (next === "") {
      if (value !== null) onPatch({ phone: null });
      return;
    }
    if (isCompleteRussianPhoneInput(next)) {
      onPatch({ phone: next });
    }
  }

  return (
    <div>
      <div className="relative">
        <Phone
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          aria-hidden
        />
        <Input
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={T.fields.phonePlaceholder}
          inputMode="tel"
          autoComplete="tel"
          maxLength={18}
          className="pl-9"
          aria-invalid={incomplete || undefined}
          aria-describedby={incomplete ? hintId : undefined}
        />
      </div>
      {incomplete ? (
        <p id={hintId} className="mt-1 text-xs text-warning-text">
          {T.fields.phoneIncomplete}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Linked accounts                                                            */
/* -------------------------------------------------------------------------- */

function LinkedAccountsCard({
  data,
  vkAuthEnabled,
  onTelegramConnect,
  onTelegramUnlink,
  onVkConnect,
  onVkUnlink,
}: {
  data: ProfileDTO;
  vkAuthEnabled: boolean;
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
        subtitle={T.sectionHints.linkedAccounts}
      />

      <div className="space-y-2.5">
        {/* FIX-LINK-STATE-CONSISTENCY-01 + disconnect-gate split: the row shows
            three states from the two orthogonal facts (linked / deliveryEnabled),
            and NEVER offers «Подключить» for a linked account. The row renders
            when LINKED or when Telegram is enabled; connect is reachable only
            when enabled (else the row is absent). A linked account keeps
            «Отключить» even when Telegram is killed — never strand a user. */}
        {(tg.linked || isTelegramEnabled) && (
          <ConnectRow
            icon={<MessageCircle className="h-5 w-5" aria-hidden />}
            iconColor="#2AABEE"
            name="Telegram"
            connected={tg.linked}
            status={
              !tg.linked
                ? "Войти через Telegram и получать уведомления"
                : !tg.deliveryEnabled
                  ? tg.username
                    ? `@${tg.username} · ${T.linkedAccounts.deliveryOff}`
                    : T.linkedAccounts.linkedDeliveryOff
                  : tg.username
                    ? `@${tg.username} · подключён ${formatConnectedAt(tg.connectedAt)}`
                    : `подключён ${formatConnectedAt(tg.connectedAt)}`
            }
            actionLabel={tg.linked ? T.linkedAccounts.telegramDisconnect : T.linkedAccounts.telegramConnect}
            onAction={tg.linked ? onTelegramUnlink : onTelegramConnect}
          />
        )}
        {/* FIX-EXTERNAL-GATING-01 (G-3) + FIX-LINK-STATE-CONSISTENCY-01: the VK
            connect affordance gates on `isVkAuthEnabled`; disconnect stays for a
            linked account regardless. Three states from linked / deliveryEnabled
            — a linked-but-notifications-off account shows «Подключено ·
            уведомления выключены» + «Отключить», never «Не подключено». */}
        {(vk.linked || vkAuthEnabled) && (
          <ConnectRow
            icon={<Users className="h-5 w-5" aria-hidden />}
            iconColor="#0077FF"
            name="ВКонтакте"
            connected={vk.linked}
            status={
              !vk.linked
                ? "Войти через VK и получать уведомления"
                : !vk.deliveryEnabled
                  ? T.linkedAccounts.linkedDeliveryOff
                  : `подключён ${formatConnectedAt(vk.connectedAt)}`
            }
            actionLabel={vk.linked ? T.linkedAccounts.vkDisconnect : T.linkedAccounts.vkConnect}
            onAction={vk.linked ? onVkUnlink : onVkConnect}
          />
        )}
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

/**
 * Удаление аккаунта живёт в настройках (одно на все роли, с подтверждением) —
 * карточка ведёт туда, к якорю секции. Раньше здесь была заглушка «скоро
 * появится», хотя удаление давно работало.
 */
function DangerZoneCard() {
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
          asChild
          variant="wrapper"
          size="none"
          className="inline-flex h-9 items-center justify-center rounded-2xl px-3 text-sm font-medium text-danger-text transition-colors hover:bg-danger-surface"
        >
          <Link href="/cabinet/settings#delete-account">{T.danger.cardCta}</Link>
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
  // FIX-TELEGRAM-COPY-SWEEP: exclude the tgLinked step when Telegram is off so
  // the "X из N" text matches the (server-recomputed) percent and 100% is
  // reachable without a Telegram step.
  const countedEntries = Object.entries(completion.items).filter(
    ([key]) => isTelegramEnabled || key !== "tgLinked"
  );
  const total = countedEntries.length;
  const done = countedEntries.filter(([, value]) => Boolean(value)).length;
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
      {CHECKLIST_ROWS.filter(
        // FIX-TELEGRAM-KILLSWITCH: drop the "Telegram" checklist row when off.
        (row) => isTelegramEnabled || row.key !== "tgLinked"
      ).map((row) => {
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
// `ResilientImage` + `Textarea` may be re-introduced when photo previews / email
// modals land. Mark as referenced explicitly.
export const _ProfileImports = { ResilientImage, Textarea, MapPin };
