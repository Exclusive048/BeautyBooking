"use client";

import { useEffect, useMemo, useState } from "react";
import type { BookingService } from "@/features/booking/model/types";
import { SlotPicker } from "@/features/booking/components/slot-picker";
import { timeToMinutes } from "@/lib/schedule/time";
import { Card, CardContent } from "@/components/ui/card";
import { ApiClientError, fetchJson, getErrorMessageByCode } from "@/lib/http/client";
import { DatePicker } from "@/components/ui/date-picker";

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

function formatDuration(min: number | null | undefined) {
  if (!min || min <= 0) return null;
  if (min % 60 === 0) return `${min / 60} ч`;
  return `${min} мин`;
}

function buildLoginUrl(nextPath: string) {
  const p = new URLSearchParams();
  p.set("next", nextPath);
  return `/login?${p.toString()}`;
}

function toDateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateKey(new Date()));
  const dateBounds = useMemo(() => {
    const min = toDateKey(new Date());
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14);
    return { min, max: toDateKey(maxDate) };
  }, []);

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
        const data = await fetchJson<{ user: BookingUser | null }>("/api/me", { method: "GET" });

        if (cancelled) return;

        const user = data.user ?? null;
        setMe(user);

        if (user) {
          if (!clientName.trim() && user.displayName) setClientName(user.displayName);
          if (!clientPhone.trim() && user.phone) setClientPhone(user.phone);
        }
      } catch {
        if (!cancelled) setMe(null);
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

        const data = await fetchJson<{ slots: SlotItem[] }>(url.toString(), { cache: "no-store" });

        if (cancelled) return;
        setSlots(data.slots);
        setSlotLabel((prev) => prev || data.slots[0]?.label || "");
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiClientError) {
            const mapped = getErrorMessageByCode(e.code);
            setSlotsError(mapped ?? e.message ?? "???? ?????????????? ?????????????????? ??????????");
          } else {
            setSlotsError(e instanceof Error ? e.message : "?????????????????????? ????????????");
          }
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

  const slotByLabel = useMemo(() => new Map(slots.map((s) => [s.label, s])), [slots]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [] as SlotItem[];
    return slots.filter((s) => s.label.startsWith(`${selectedDate} `));
  }, [slots, selectedDate]);

  const slotGroups = useMemo(() => {
    const items = slotsForSelectedDate
      .map((slot) => {
        const [date, time] = slot.label.split(" ");
        if (!date || !time) return null;
        const minutes = timeToMinutes(time);
        if (minutes === null) return null;
        return { label: slot.label, minutes };
      })
      .filter((v): v is { label: string; minutes: number } => Boolean(v));

    items.sort((a, b) => a.minutes - b.minutes);

    const groups = [
      { id: "morning", label: "Утро", items: [] as string[] },
      { id: "day", label: "День", items: [] as string[] },
      { id: "evening", label: "Вечер", items: [] as string[] },
    ];

    for (const item of items) {
      const group = item.minutes < 13 * 60 ? groups[0] : item.minutes < 18 * 60 ? groups[1] : groups[2];
      group.items.push(item.label);
    }

    return groups
      .filter((g) => g.items.length > 0)
      .map((g) => ({
        id: `${selectedDate}-${g.id}`,
        label: g.label,
        items: g.items,
      }));
  }, [slotsForSelectedDate, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    if (slotLabel.startsWith(`${selectedDate} `)) return;
    const next = slotsForSelectedDate[0]?.label ?? "";
    if (next) setSlotLabel(next);
  }, [selectedDate, slotLabel, slotsForSelectedDate]);

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
      const data = await fetchJson<{ booking: { id: string } }>("/api/bookings", {
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

      setSuccessId(data.booking?.id ?? "ok");
      setComment("");
    } catch (error) {
      if (error instanceof ApiClientError) {
        const mapped = getErrorMessageByCode(error.code);
        if (error.status === 401 && error.code === "UNAUTHORIZED") {
          setShowAuthModal(true);
          return;
        }
        setErrorText(mapped ?? error.message ?? "???? ?????????????? ?????????????? ????????????");
      } else {
        setErrorText("???? ?????????????? ?????????????? ????????????");
      }
    } finally {
      setLoading(false);
    }
  }

  const hasSlotsForSelectedDate = slotsForSelectedDate.length > 0;

  if (providerType !== "STUDIO") {
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
              <div className="font-semibold">{formatMoney(selectedService.price)} ₽</div>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          {meLoading ? (
            <div className="text-sm text-neutral-600">Проверяем авторизацию…</div>
          ) : me ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Вы авторизованы
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
            Заявка отправлена (ID: {successId})
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
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
                  {s.name} • {s.durationMin} мин • {formatMoney(s.price)} ₽
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
              <div className="mt-2 space-y-3">
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

  return (
    <div className="rounded-2xl border p-5 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Запись</div>
          <div className="text-sm text-neutral-600 mt-1">Выберите услугу, затем мастера и время</div>
        </div>
      </div>

      <div className="mt-4">
        {meLoading ? (
          <div className="text-sm text-neutral-600">Проверяем авторизацию…</div>
        ) : me ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Вы авторизованы
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
          Заявка отправлена (ID: {successId})
        </div>
      ) : null}

      <div className="mt-5 space-y-6">
        <div>
          <div className="text-sm font-medium">????</div>
          <div className="mt-2">
            <DatePicker
              value={selectedDate}
              min={dateBounds.min}
              max={dateBounds.max}
              onChange={setSelectedDate}
              disabled={loading}
            />
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            ????????? ????: ? {dateBounds.min} ?? {dateBounds.max}.
          </div>
        </div>

        <div>
          <div className="text-sm font-medium">Услуги</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {services.length === 0 ? (
              <div className="text-sm text-neutral-600">Услуг пока нет.</div>
            ) : (
              services.map((s) => {
                const active = s.id === serviceId;
                const duration = formatDuration(s.durationMin);
                return (
                  <Card
                    key={s.id}
                    className={`cursor-pointer border ${
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white hover:border-neutral-400"
                    }`}
                    onClick={() => {
                      setServiceId(s.id);
                      setSlotLabel("");
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className={`mt-2 text-xs ${active ? "text-neutral-200" : "text-neutral-500"}`}>
                        {duration ? duration : "Длительность уточняется"}
                      </div>
                      <div className={`mt-1 text-sm ${active ? "text-white" : "text-neutral-800"}`}>
                        {s.price > 0 ? `от ${formatMoney(s.price)} ₽` : "Цена уточняется"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {serviceId ? (
          <div>
            <div className="text-sm font-medium">Мастера</div>
            {masters.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-600">Нет доступных мастеров.</div>
            ) : (
              <div className="mt-3 grid gap-3">
                {masters.map((m) => {
                  const active = m.id === masterId;
                  const slotsCount = active ? slotsForSelectedDate.length : null;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMasterId(m.id);
                        setSlotLabel("");
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white hover:border-neutral-400"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-12 w-12 rounded-2xl ${
                            active ? "bg-white/10" : "bg-neutral-100"
                          }`}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{m.name}</div>
                          <div className={`mt-1 text-xs ${active ? "text-neutral-200" : "text-neutral-500"}`}>
                            Рейтинг уточняется
                          </div>
                        </div>
                        <div className={`text-xs ${active ? "text-neutral-200" : "text-neutral-500"}`}>
                          {slotsCount !== null
                            ? `Слотов: ${slotsCount}`
                            : "Слоты уточняются"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedService ? (
              <div className="mt-3 text-sm text-neutral-600">
                {selectedService.durationMin > 0
                  ? `Длительность: ${formatDuration(selectedService.durationMin)}`
                  : "Длительность: уточняется"}
                {selectedService.price > 0
                  ? ` · Цена: от ${formatMoney(selectedService.price)} ₽`
                  : " · Цена: уточняется"}
                {masterId
                  ? ` · Слотов на дату: ${slotsForSelectedDate.length || 0}`
                  : " · Слоты уточняются"}
              </div>
            ) : null}
          </div>
        ) : null}

        {masterId ? (
          <div>
            <div className="text-sm font-medium">Слоты</div>
            {slotsLoading ? (
              <div className="mt-2 text-sm text-neutral-600">Загрузка слотов…</div>
            ) : slotsError ? (
              <div className="mt-2 text-sm text-red-600">{slotsError}</div>
            ) : slotGroups.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-600">
                Нет слотов на выбранную дату. Попробуйте другую дату или мастера.
              </div>
            ) : (
              <div className="mt-3">
                <SlotPicker groups={slotGroups} value={slotLabel} onChange={setSlotLabel} />
              </div>
            )}
          </div>
        ) : null}

        <div className="grid gap-3">
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
        </div>

        <button
          onClick={submit}
          disabled={
            loading ||
            (!meLoading && !me) ||
            !serviceId ||
            !masterId ||
            !slotLabel ||
            !hasSlotsForSelectedDate
          }
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
              ×
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
