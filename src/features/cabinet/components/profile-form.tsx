"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { ApiResponse } from "@/lib/types/api";

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
};

type Props = {
  initialUser: MeDto;
  showProfessionalCta?: boolean;
};

export function ProfileForm({ initialUser, showProfessionalCta = true }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasMasterRole = initialUser.roles.includes("MASTER");
  const hasStudioRole = initialUser.roles.includes("STUDIO") || initialUser.roles.includes("STUDIO_ADMIN");
  const hasProfessionalRole = hasMasterRole || hasStudioRole;
  const canAddMasterRole = hasStudioRole && !hasMasterRole;

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

        if (!data || !data.ok) {
          setError(data?.error?.message ?? "Не удалось сохранить");
          return;
        }

        setSaved("Сохранено");
      } catch {
        setError("Сеть недоступна или сервер не отвечает");
      }
    });
  };

  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

  const labelClass = "text-xs font-medium text-neutral-600";

  return (
    <div className="rounded-2xl border p-5 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Профиль</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Все поля пока необязательные. Заполните то, что хотите показывать/использовать.
        </p>
      </div>

      {showProfessionalCta ? (
        <div className="rounded-2xl border p-4">
          <div className="text-sm font-semibold">Мои профессиональные роли</div>
          <div className="mt-1 text-sm text-neutral-600">
            {hasProfessionalRole
              ? "У вас уже есть профессиональные роли."
              : "Вы пока клиент. Начните работу как мастер или студия."}
          </div>
          {!hasProfessionalRole ? (
            <div className="mt-3">
              <Link
                href="/onboarding/professional"
                className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Стать профессионалом
              </Link>
            </div>
          ) : null}
          {canAddMasterRole ? (
            <div className="mt-3">
              <Link
                href="/api/onboarding/professional/master"
                className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Добавить роль мастера
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

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
            Позже добавим кнопку “Показать на карте” и будем сохранять координаты.
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
