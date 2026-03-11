"use client";

import { useMemo, useState, useTransition } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import { HeaderBlock } from "@/components/ui/header-block";
import { Input } from "@/components/ui/input";
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
};

export function ProfileForm({ initialUser }: Props) {
  const t = UI_TEXT.clientCabinet;
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    phone: initialUser.phone ?? "",
    email: initialUser.email ?? "",
    firstName: initialUser.firstName ?? "",
    lastName: initialUser.lastName ?? "",
    middleName: initialUser.middleName ?? "",
    birthDate: initialUser.birthDate ?? "",
  });

  const changed = useMemo(() => {
    const normalize = (s: string) => s.trim();
    return (
      normalize(form.phone) !== (initialUser.phone ?? "") ||
      normalize(form.email) !== (initialUser.email ?? "") ||
      normalize(form.firstName) !== (initialUser.firstName ?? "") ||
      normalize(form.lastName) !== (initialUser.lastName ?? "") ||
      normalize(form.middleName) !== (initialUser.middleName ?? "") ||
      normalize(form.birthDate) !== (initialUser.birthDate ?? "")
    );
  }, [form, initialUser]);

  const onSave = () => {
    setSaved(false);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: form.phone,
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            middleName: form.middleName,
            birthDate: form.birthDate,
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

        setSaved(true);
      } catch {
        setError(t.profile.networkError);
      }
    });
  };

  return (
    <section className="lux-card rounded-[24px] p-5 space-y-5">
      <HeaderBlock title={t.profile.profileSectionTitle} subtitle={t.profile.profileSectionSubtitle} />

      <AvatarEditor
        entityType="USER"
        entityId={initialUser.id}
        fallbackUrl={initialUser.externalPhotoUrl}
        showAddButton={false}
      />

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
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

        <div className="space-y-1">
          <div className="text-xs font-medium text-text-label">{t.profile.birthDate}</div>
          <Input
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm((s) => ({ ...s, birthDate: e.target.value }))}
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

      <div className="flex items-center justify-end gap-3">
        {saved ? <span className="text-sm text-text-sec">{UI_TEXT.common.saved}</span> : null}
        <Button type="button" disabled={pending || !changed} onClick={onSave}>
          {pending ? t.profile.saving : t.common.save}
        </Button>
      </div>
    </section>
  );
}
