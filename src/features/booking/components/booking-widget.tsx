"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import type { BookingService } from "@/features/booking/model/types";
import { SlotPicker } from "@/features/booking/components/slot-picker";

type BookingUser = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
};

type MasterOption = {
  id: string;
  name: string;
};

type SlotItem = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
};

type Props = {
  providerId: string;
  providerType: "MASTER" | "STUDIO";
  services: BookingService[];
  masters?: MasterOption[];
  defaultServiceId?: string;
};

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("ru-RU").format(n);
  } catch {
    return String(n);
  }
}

function buildLoginUrl(nextPath: string) {
  const p = new URLSearchParams();
  p.set("next", nextPath);
  return `/login?${p.toString()}`;
}

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export default function BookingWidget({
  providerId,
  providerType,
  services,
  masters = [],
  defaultServiceId,
}: Props) {
  const initialServiceId = useMemo(() => {
    if (defaultServiceId && services.some((s) => s.id === defaultServiceId)) return defaultServiceId;
    return services[0]?.id ?? "";
  }, [defaultServiceId, services]);

  const [serviceId, setServiceId] = useState(initialServiceId);
  const [masterId, setMasterId] = useState(masters[0]?.id ?? "");
  const [slotLabel, setSlotLabel] = useState("");
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [comment, setComment] = useState("");

  const [me, setMe] = useState<BookingUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const nextPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "/";

  useEffect(() => {
    setMasterId(masters[0]?.id ?? "");
  }, [masters]);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      setMeLoading(true);
      try {
        const res = await fetch("/api/me", { method: "GET" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ user: BookingUser | null }>
          | null;

        if (cancelled) return;

        const user = json?.ok ? json.data.user : null;
        setMe(user);

        if (user) {
          if (!clientName.trim() && user.displayName) setClientName(user.displayName);
          if (!clientPhone.trim() && user.phone) setClientPhone(user.phone);
        }
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      const targetMasterId = providerType === "STUDIO" ? masterId : providerId;
      if (!serviceId || !targetMasterId) {
        setSlots([]);
        setSlotLabel("");
        return;
      }

      setSlotsLoading(true);
      setSlotsError(null);

      try {
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 14);
        const url = new URL(`/api/masters/${targetMasterId}/availability`, window.location.origin);
        url.searchParams.set("serviceId", serviceId);
        url.searchParams.set("from", from.toISOString());
        url.searchParams.set("to", to.toISOString());

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ slots: SlotItem[] }>
          | null;

        if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load slots"));
        if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load slots"));

        if (cancelled) return;
        setSlots(json.data.slots);
        setSlotLabel((prev) => prev || json.data.slots[0]?.label || "");
      } catch (e) {
        if (!cancelled) {
          setSlotsError(e instanceof Error ? e.message : "Unknown error");
          setSlots([]);
          setSlotLabel("");
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [providerId, providerType, masterId, serviceId]);

  const slotGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const slot of slots) {
      const [date, time] = slot.label.split(" ");
      if (!date || !time) continue;
      const list = map.get(date) ?? [];
      list.push(time);
      map.set(date, list);
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }, [slots]);

  const slotByLabel = useMemo(() => new Map(slots.map((s) => [s.label, s])), [slots]);

  async function submit() {
    setErrorText(null);
    setSuccessId(null);

    if (!providerId) {
      setErrorText("providerId не задан");
      return;
    }

    if (providerType === "STUDIO" && !masterId) {
      setErrorText("Выберите мастера");
      return;
    }

    if (!serviceId) {
      setErrorText("Выберите услугу");
      return;
    }

    if (!slotLabel) {
      setErrorText("Выберите слот/время");
      return;
    }

    if (!clientName.trim()) {
      setErrorText("Введите имя");
      return;
    }
    if (!clientPhone.trim()) {
      setErrorText("Введите телефон");
      return;
    }

    const slot = slotByLabel.get(slotLabel) ?? null;
    if (!slot) {
      setErrorText("Выберите корректный слот");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          serviceId,
          masterProviderId: providerType === "STUDIO" ? masterId : undefined,
          startAtUtc: slot.startAtUtc,
          endAtUtc: slot.endAtUtc,
          slotLabel: slot.label,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          comment: comment.trim() ? comment.trim() : null,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ booking: { id: string } }>
        | null;

      const errorCode = json && !json.ok ? json.error?.code : undefined;
      if (res.status === 401 && (errorCode === "AUTH_REQUIRED" || errorCode === "UNAUTHORIZED")) {
        setShowAuthModal(true);
        return;
      }

      if (!res.ok) {
        setErrorText(getErrorMessage(json, "Не удалось создать запись"));
        return;
      }

      if (!json || !json.ok) {
        setErrorText(getErrorMessage(json, "Не удалось создать запись"));
        return;
      }

      setSuccessId(json.data.booking?.id ?? "ok");
      setComment("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-5 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Запись</div>
          <div className="text-sm text-neutral-600 mt-1">
            Запись доступна только авторизованным клиентам.
          </div>
        </div>

        {selectedService ? (
          <div className="text-right">
            <div className="text-sm text-neutral-600">Стоимость</div>
            <div className="font-semibold">{formatMoney(selectedService.price)} ?</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        {meLoading ? (
          <div className="text-sm text-neutral-600">Проверяем авторизацию…</div>
        ) : me ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Вы авторизованы ?
            {me.phone ? <span className="ml-2 text-emerald-700">({me.phone})</span> : null}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Войдите, чтобы записаться.
            <a href={buildLoginUrl(nextPath)} className="ml-2 underline font-medium">
              Войти
            </a>
          </div>
        )}
      </div>

      {errorText ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorText}
        </div>
      ) : null}

      {successId ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Заявка отправлена ? (ID: {successId})
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {providerType === "STUDIO" ? (
          <div>
            <label className="block text-sm font-medium">Мастер</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              disabled={loading}
            >
              <option value="">Выберите мастера</option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium">Услуга</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            disabled={loading}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} • {s.durationMin} мин • {formatMoney(s.price)} ?
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Слот</label>
          {slotsLoading ? (
            <div className="mt-2 text-sm text-neutral-600">Загрузка слотов…</div>
          ) : slotsError ? (
            <div className="mt-2 text-sm text-red-600">{slotsError}</div>
          ) : slotGroups.length === 0 ? (
            <div className="mt-2 text-sm text-neutral-600">Свободных слотов нет.</div>
          ) : (
            <div className="mt-2">
              <SlotPicker groups={slotGroups} value={slotLabel} onChange={setSlotLabel} />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium">Имя</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
            placeholder="Ваше имя"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Телефон</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
            placeholder="+7..."
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            disabled={loading}
            inputMode="tel"
            autoComplete="tel"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Комментарий (необязательно)</label>
          <textarea
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 min-h-[90px]"
            placeholder="Например: хочу естественный нюд"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={loading}
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || (!meLoading && !me)}
          className="w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Отправляем..." : "Записаться"}
        </button>
      </div>

      {showAuthModal ? (
        <Modal title="Войдите, чтобы записаться" onClose={() => setShowAuthModal(false)}>
          <div className="text-sm text-neutral-700">
            Мы принимаем записи только от авторизованных клиентов — так мастерам спокойнее и меньше
            фейковых заявок.
          </div>

          <div className="mt-5 flex gap-3">
            <a
              href={buildLoginUrl(nextPath)}
              className="flex-1 text-center rounded-xl bg-black text-white py-2 font-medium"
            >
              Войти
            </a>
            <button
              onClick={() => setShowAuthModal(false)}
              className="flex-1 rounded-xl border py-2 font-medium"
            >
              Не сейчас
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="text-lg font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-neutral-600 hover:bg-neutral-100"
              aria-label="Close"
            >
              ?
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
