"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse } from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import { HeaderBlock } from "@/components/ui/header-block";
import { Input } from "@/components/ui/input";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { UI_TEXT } from "@/lib/ui/text";
import { AvatarEditor } from "@/features/media/components/avatar-editor";

type MeDto = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  externalPhotoUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: string | null; // yyyy-mm-dd
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
  hasMasterProfile: boolean;
  hasStudioProfile: boolean;
};

type Props = {
  initialUser: MeDto;
  showProfessionalCta?: boolean;
};

type ProfileCreateResponse = { profile: { id: string; providerId: string } };

type RoleAction = "master" | "studio" | null;

export function ProfileForm({ initialUser, showProfessionalCta = true }: Props) {
  const t = UI_TEXT.clientCabinet;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleAction, setRoleAction] = useState<RoleAction>(null);

  const hasMasterProfile = initialUser.hasMasterProfile;
  const hasStudioProfile = initialUser.hasStudioProfile;

  const [form, setForm] = useState({
    displayName: initialUser.displayName ?? "",
    phone: initialUser.phone ?? "",
    email: initialUser.email ?? "",
    firstName: initialUser.firstName ?? "",
    lastName: initialUser.lastName ?? "",
    middleName: initialUser.middleName ?? "",
    birthDate: initialUser.birthDate ?? "",
    address: initialUser.address ?? "",
  });

  const changed = useMemo(() => {
    const normalize = (s: string) => s.trim();
    return (
      normalize(form.displayName) !== (initialUser.displayName ?? "") ||
      normalize(form.phone) !== (initialUser.phone ?? "") ||
      normalize(form.email) !== (initialUser.email ?? "") ||
      normalize(form.firstName) !== (initialUser.firstName ?? "") ||
      normalize(form.lastName) !== (initialUser.lastName ?? "") ||
      normalize(form.middleName) !== (initialUser.middleName ?? "") ||
      normalize(form.birthDate) !== (initialUser.birthDate ?? "") ||
      normalize(form.address) !== (initialUser.address ?? "")
    );
  }, [form, initialUser]);

  const onSave = () => {
    setSaved(null);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: form.displayName,
            phone: form.phone,
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            middleName: form.middleName,
            birthDate: form.birthDate,
            address: form.address,
          }),
        });

        const data = (await res.json().catch(() => null)) as
          | ApiResponse<{ user: MeDto }>
          | null;

        if (!res.ok) {
          setError(t.profile.saveFailed);
          return;
        }

        const message = data && !data.ok ? data.error.message : null;

        if (!data || !data.ok) {
          setError(message ?? t.profile.saveFailed);
          return;
        }

        setSaved(t.profile.saved);
      } catch {
        setError(t.profile.networkError);
      }
    });
  };

  const createMasterProfile = async () => {
    setRoleMessage(null);
    setRoleError(null);
    setRoleAction("master");

    try {
      const res = await fetch("/api/profiles/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => null)) as
        | ApiResponse<ProfileCreateResponse>
        | null;

      const message = data && !data.ok ? data.error.message : null;

      if (!res.ok) {
        setRoleError(message ?? t.profile.createMasterFailed);
        return;
      }

      if (!data || !data.ok) {
        setRoleError(message ?? t.profile.createMasterFailed);
        return;
      }

      setRoleMessage(t.profile.masterCreated);
      router.refresh();
    } catch {
      setRoleError(t.profile.networkError);
    } finally {
      setRoleAction(null);
    }
  };

  const createStudioProfile = async () => {
    setRoleMessage(null);
    setRoleError(null);
    setRoleAction("studio");

    try {
      const res = await fetch("/api/profiles/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => null)) as
        | ApiResponse<ProfileCreateResponse>
        | null;

      const message = data && !data.ok ? data.error.message : null;

      if (!res.ok) {
        setRoleError(message ?? t.profile.createStudioFailed);
        return;
      }

      if (!data || !data.ok) {
        setRoleError(message ?? t.profile.createStudioFailed);
        return;
      }

      setRoleMessage(t.profile.studioCreated);
      router.refresh();
    } catch {
      setRoleError(t.profile.networkError);
    } finally {
      setRoleAction(null);
    }
  };

  const isCreatingMaster = roleAction === "master";
  const isCreatingStudio = roleAction === "studio";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <section className="lux-card rounded-[24px] p-5 space-y-5">
        <HeaderBlock title={t.profile.profileSectionTitle} subtitle={t.profile.profileSectionSubtitle} />

        <AvatarEditor
          entityType="USER"
          entityId={initialUser.id}
          fallbackUrl={initialUser.externalPhotoUrl}
          showAddButton={false}
        />

        {saved ? (
          <div className="rounded-xl border border-border-subtle bg-bg-input/70 px-4 py-3 text-sm text-text-main">
            {saved}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs font-medium text-text-label">{t.profile.lastName}</div>
            <Input
              value={form.lastName}
              onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))}
              placeholder={t.profile.lastNamePlaceholder}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-text-label">{t.profile.firstName}</div>
            <Input
              value={form.firstName}
              onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))}
              placeholder={t.profile.firstNamePlaceholder}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-text-label">{t.profile.middleName}</div>
            <Input
              value={form.middleName}
              onChange={(e) => setForm((s) => ({ ...s, middleName: e.target.value }))}
              placeholder={t.profile.middleNamePlaceholder}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-1">
            <div className="text-xs font-medium text-text-label">{t.profile.displayName}</div>
            <Input
              value={form.displayName}
              onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
              placeholder={t.profile.displayNamePlaceholder}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-text-label">{t.common.phone}</div>
            <Input
              value={form.phone}
              onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
              placeholder={t.profile.phonePlaceholder}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-text-label">{t.profile.email}</div>
            <Input
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              placeholder={t.profile.emailPlaceholder}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs font-medium text-text-label">{t.profile.birthDate}</div>
            <Input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm((s) => ({ ...s, birthDate: e.target.value }))}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <div className="text-xs font-medium text-text-label">{t.profile.address}</div>
            <Input
              value={form.address}
              onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
              placeholder={t.profile.addressPlaceholder}
            />
            <div className="text-xs text-text-sec mt-1">
              {t.profile.mapHint}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={pending || !changed}
            onClick={onSave}
          >
            {pending ? t.profile.saving : t.common.save}
          </Button>
        </div>
      </section>

      <aside className="space-y-4">
        {showProfessionalCta ? (
          <section className="lux-card rounded-[24px] p-4 space-y-3">
            <div className="text-sm font-semibold text-text-main">{t.profile.professionalRolesTitle}</div>
            <div className="space-y-2 rounded-2xl border border-border-subtle bg-bg-input/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-text-main">{t.profile.becomeMaster}</div>
                {hasMasterProfile ? (
                  <span className="text-xs text-text-sec">{t.profile.alreadyMaster}</span>
                ) : (
                  <Button
                    type="button"
                    onClick={createMasterProfile}
                    disabled={roleAction !== null}
                    variant="secondary"
                    size="sm"
                  >
                    {isCreatingMaster ? t.profile.creatingMaster : t.profile.becomeMaster}
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-text-main">{t.profile.createStudio}</div>
                {hasStudioProfile ? (
                  <span className="text-xs text-text-sec">{t.profile.alreadyStudioOwner}</span>
                ) : (
                  <Button
                    type="button"
                    onClick={createStudioProfile}
                    disabled={roleAction !== null}
                    variant="secondary"
                    size="sm"
                  >
                    {isCreatingStudio ? t.profile.creatingStudio : t.profile.createStudio}
                  </Button>
                )}
              </div>
            </div>
            {roleMessage ? <div className="text-xs text-green-700">{roleMessage}</div> : null}
            {roleError ? <div className="text-xs text-red-600">{roleError}</div> : null}
          </section>
        ) : null}

        <section className="lux-card rounded-[24px] p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold text-text-main">{t.profile.integrationsTitle}</div>
            <div className="mt-1 text-xs text-text-sec">{t.profile.integrationsSubtitle}</div>
          </div>
          <TelegramNotificationsSection embedded />
        </section>

        <section className="lux-card rounded-[24px] p-4 space-y-2">
          <div className="text-sm font-semibold text-text-main">{t.profile.securityTitle}</div>
          <div className="text-xs text-text-sec">{t.profile.securitySubtitle}</div>
          <div className="text-xs text-text-sec">{t.profile.securityHint}</div>
        </section>
      </aside>
    </div>
  );
}
