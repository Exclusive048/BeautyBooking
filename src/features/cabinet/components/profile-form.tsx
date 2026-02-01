"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse } from "@/lib/types/api";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";

type MeDto = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
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
          setError("Не удалось сохранить");
          return;
        }

        const message = data && !data.ok ? data.error.message : null;

        if (!data || !data.ok) {
          setError(message ?? "Не удалось сохранить");
          return;
        }

        setSaved("Сохранено");
      } catch {
        setError("Сеть недоступна или сервер не отвечает");
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
        setRoleError(message ?? "Не удалось создать профиль мастера");
        return;
      }

      if (!data || !data.ok) {
        setRoleError(message ?? "Не удалось создать профиль мастера");
        return;
      }

      setRoleMessage("Профиль мастера создан");
      router.refresh();
    } catch {
      setRoleError("Сеть недоступна или сервер не отвечает");
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
        setRoleError(message ?? "Не удалось создать студию");
        return;
      }

      if (!data || !data.ok) {
        setRoleError(message ?? "Не удалось создать студию");
        return;
      }

      setRoleMessage("Студия создана");
      router.refresh();
    } catch {
      setRoleError("Сеть недоступна или сервер не отвечает");
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
        <h2 className="text-lg font-semibold">Профиль</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Все поля пока необязательные. Заполните то, что хотите показывать/использовать.
        </p>
      </div>

      {showProfessionalCta ? (
        <div className="rounded-2xl border p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">Мои профессиональные роли</div>
            <div className="mt-1 text-sm text-neutral-600">
              {hasProfessionalRole
                ? "Вы уже добавили профессиональные роли. Можно добавить еще."
                : "Вы пока клиент. Добавьте роль мастера или студии."}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasMasterProfile ? (
              <div className="text-xs text-neutral-600">Вы уже мастер</div>
            ) : (
              <button
                type="button"
                onClick={createMasterProfile}
                disabled={roleAction !== null}
                className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                {isCreatingMaster ? "Создаем профиль мастера..." : "Стать мастером"}
              </button>
            )}

            {hasStudioProfile ? (
              <div className="text-xs text-neutral-600">Вы уже владелец студии</div>
            ) : (
              <button
                type="button"
                onClick={createStudioProfile}
                disabled={roleAction !== null}
                className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                {isCreatingStudio ? "Создаем студию..." : "Создать студию"}
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
          <div className={labelClass}>Фамилия</div>
          <input
            className={inputClass}
            value={form.lastName}
            onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))}
            placeholder="Иванов"
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>Имя</div>
          <input
            className={inputClass}
            value={form.firstName}
            onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))}
            placeholder="Иван"
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>Отчество</div>
          <input
            className={inputClass}
            value={form.middleName}
            onChange={(e) => setForm((s) => ({ ...s, middleName: e.target.value }))}
            placeholder="Иванович"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1 md:col-span-1">
          <div className={labelClass}>Отображаемое имя</div>
          <input
            className={inputClass}
            value={form.displayName}
            onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
            placeholder="Как вас показывать в интерфейсе"
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>Телефон</div>
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
            placeholder="+7..."
          />
        </div>

        <div className="space-y-1">
          <div className={labelClass}>Почта</div>
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
          <div className={labelClass}>Дата рождения</div>
          <input
            type="date"
            className={inputClass}
            value={form.birthDate}
            onChange={(e) => setForm((s) => ({ ...s, birthDate: e.target.value }))}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <div className={labelClass}>Адрес</div>
          <input
            className={inputClass}
            value={form.address}
            onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
            placeholder="Город, улица, дом..."
          />
          <div className="text-xs text-neutral-500 mt-1">
            Позже добавим кнопку &quot;Показать на карте&quot; и будем сохранять координаты.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-neutral-500">Роли: {initialUser.roles.join(", ")}</div>

        <button
          type="button"
          disabled={pending || !changed}
          onClick={onSave}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
