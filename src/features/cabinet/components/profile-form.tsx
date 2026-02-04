"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse } from "@/lib/types/api";
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
  const hasProfessionalRole = hasMasterProfile || hasStudioProfile;

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

  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

  const labelClass = "text-xs font-medium text-neutral-600";

  const isCreatingMaster = roleAction === "master";
  const isCreatingStudio = roleAction === "studio";

  return (
    <div className="rounded-2xl border p-5 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t.common.profile}</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {t.profile.description}
        </p>
      </div>

      <AvatarEditor
        entityType="USER"
        entityId={initialUser.id}
        fallbackUrl={initialUser.externalPhotoUrl}
      />

      {showProfessionalCta ? (
        <div className="rounded-2xl border p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">{t.profile.professionalRolesTitle}</div>
            <div className="mt-1 text-sm text-neutral-600">
              {hasProfessionalRole
                ? t.profile.rolesAddedCanAddMore
                : t.profile.stillClientAddRole}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasMasterProfile ? (
              <div className="text-xs text-neutral-600">{t.profile.alreadyMaster}</div>
            ) : (
              <button
                type="button"
                onClick={createMasterProfile}
                disabled={roleAction !== null}
                className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                {isCreatingMaster ? t.profile.creatingMaster : t.profile.becomeMaster}
              </button>
            )}

            {hasStudioProfile ? (
              <div className="text-xs text-neutral-600">{t.profile.alreadyStudioOwner}</div>
            ) : (
              <button
                type="button"
                onClick={createStudioProfile}
                disabled={roleAction !== null}
                className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                {isCreatingStudio ? t.profile.creatingStudio : t.profile.createStudio}
              </button>
            )}
          </div>

          {roleMessage ? <div className="text-xs text-green-700">{roleMessage}</div> : null}
          {roleError ? <div className="text-xs text-red-600">{roleError}</div> : null}
        </div>
      ) : null}

      <TelegramNotificationsSection />

      {saved ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
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
          <div className={labelClass}>{t.profile.lastName}</div>
          <input
            className={inputClass}
            value={form.lastName}
            onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))}
            placeholder={t.profile.lastNamePlaceholder}
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>{t.profile.firstName}</div>
          <input
            className={inputClass}
            value={form.firstName}
            onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))}
            placeholder={t.profile.firstNamePlaceholder}
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>{t.profile.middleName}</div>
          <input
            className={inputClass}
            value={form.middleName}
            onChange={(e) => setForm((s) => ({ ...s, middleName: e.target.value }))}
            placeholder={t.profile.middleNamePlaceholder}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1 md:col-span-1">
          <div className={labelClass}>{t.profile.displayName}</div>
          <input
            className={inputClass}
            value={form.displayName}
            onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
            placeholder={t.profile.displayNamePlaceholder}
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>{t.common.phone}</div>
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
            placeholder="+7..."
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>{t.profile.email}</div>
          <input
            className={inputClass}
            value={form.email}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            placeholder="mail@example.com"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <div className={labelClass}>{t.profile.birthDate}</div>
          <input
            type="date"
            className={inputClass}
            value={form.birthDate}
            onChange={(e) => setForm((s) => ({ ...s, birthDate: e.target.value }))}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <div className={labelClass}>{t.profile.address}</div>
          <input
            className={inputClass}
            value={form.address}
            onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
            placeholder={t.profile.addressPlaceholder}
          />
          <div className="text-xs text-neutral-500 mt-1">
            {t.profile.mapHint}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-neutral-500">
          {t.profile.rolesLabel} {initialUser.roles.join(", ")}
        </div>

        <button
          type="button"
          disabled={pending || !changed}
          onClick={onSave}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? t.profile.saving : t.common.save}
        </button>
      </div>
    </div>
  );
}
