"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SlotPicker } from "@/features/booking/components/slot-picker";
import { groupSlotsByDayPeriod } from "@/features/booking/lib/slot-groups";
import {
  createBooking,
  fetchBookingMe,
  STUDIO_BOOKING_DAYS_AHEAD,
  buildDateBounds,
  fetchMasterAvailability,
  fetchStudioMasters,
  fetchStudioProfile,
  todayKey,
  type BookingUser,
  type SlotItem,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";
import type { ProviderProfileDto, ProviderServiceDto } from "@/lib/providers/dto";
import { moneyRUB, minutesToHuman } from "@/lib/format";

type MasterAvailability = {
  serviceAvailable: boolean;
  slots: SlotItem[];
  error?: string;
};

function buildLoginUrl(nextPath: string) {
  const p = new URLSearchParams();
  p.set("next", nextPath);
  return `/login?${p.toString()}`;
}

export default function StudioBookingPage() {
  const params = useParams<{ studioId: string }>();
  const searchParams = useSearchParams();
  const studioId = params?.studioId;
  const masterIdParam = searchParams.get("masterId") ?? "";

  const [studio, setStudio] = useState<ProviderProfileDto | null>(null);
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [serviceId, setServiceId] = useState("");
  const [masterId, setMasterId] = useState("");
  const [slotLabel, setSlotLabel] = useState("");
  const [didApplyMasterParam, setDidApplyMasterParam] = useState(false);

  const [availabilityByMaster, setAvailabilityByMaster] = useState<Record<string, MasterAvailability>>(
    {}
  );
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [comment, setComment] = useState("");

  const [me, setMe] = useState<BookingUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const dateBounds = useMemo(() => buildDateBounds(new Date(), STUDIO_BOOKING_DAYS_AHEAD), []);

  const selectedService = useMemo<ProviderServiceDto | null>(() => {
    if (!studio) return null;
    return studio.services.find((s) => s.id === serviceId) ?? null;
  }, [studio, serviceId]);

  const nextPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "/";

  useEffect(() => {
    if (!studioId) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [profileRes, mastersRes] = await Promise.all([
          fetchStudioProfile(studioId),
          fetchStudioMasters(studioId),
        ]);

        if (!profileRes.ok) {
          throw new Error(profileRes.error);
        }

        if (profileRes.provider.type !== "STUDIO") {
          throw new Error("Запись доступна только для студий");
        }

        if (!alive) return;
        setStudio(profileRes.provider);
        setMasters(mastersRes.ok ? mastersRes.masters : []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Не удалось загрузить студию");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [studioId]);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      setMeLoading(true);
      try {
        const user = await fetchBookingMe();
        if (cancelled) return;
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
    if (didApplyMasterParam) return;
    if (!masterId && masterIdParam && masters.some((m) => m.id === masterIdParam)) {
      setMasterId(masterIdParam);
      setDidApplyMasterParam(true);
    }
  }, [didApplyMasterParam, masterId, masterIdParam, masters]);

  useEffect(() => {
    setMasterId("");
    setSlotLabel("");
  }, [serviceId]);

  useEffect(() => {
    if (!serviceId || !selectedDate || masters.length === 0) {
      setAvailabilityByMaster({});
      return;
    }
    let cancelled = false;
    const unavailableCodes = new Set(["SERVICE_INVALID", "SERVICE_DISABLED", "SERVICE_NOT_FOUND"]);

    (async () => {
      setAvailabilityLoading(true);

      try {
        const results = await Promise.all(
          masters.map(async (m) => {
            const result = await fetchMasterAvailability(m.id, serviceId, selectedDate);
            return { id: m.id, result };
          })
        );

        if (cancelled) return;
        const next: Record<string, MasterAvailability> = {};

        for (const item of results) {
          if (item.result.ok) {
            next[item.id] = { serviceAvailable: true, slots: item.result.slots };
            continue;
          }

          if (unavailableCodes.has(item.result.code ?? "")) {
            next[item.id] = { serviceAvailable: false, slots: [] };
            continue;
          }

          next[item.id] = {
            serviceAvailable: true,
            slots: [],
            error: item.result.error,
          };
        }

        setAvailabilityByMaster(next);
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [masters, selectedDate, serviceId]);

  const filteredMasters = useMemo(() => {
    if (!serviceId || !selectedDate || availabilityLoading) return masters;
    return masters.filter((m) => availabilityByMaster[m.id]?.serviceAvailable !== false);
  }, [availabilityByMaster, availabilityLoading, masters, selectedDate, serviceId]);

  const selectedMasterAvailability = masterId ? availabilityByMaster[masterId] : null;
  const slotsForMaster = useMemo(
    () => selectedMasterAvailability?.slots ?? [],
    [selectedMasterAvailability]
  );

  useEffect(() => {
    if (!masterId) {
      setSlotLabel("");
      return;
    }
    if (!slotsForMaster.length) {
      setSlotLabel("");
      return;
    }
    if (slotsForMaster.some((s) => s.label === slotLabel)) return;
    setSlotLabel(slotsForMaster[0]?.label ?? "");
  }, [masterId, slotLabel, slotsForMaster]);

  useEffect(() => {
    if (!masterId) return;
    const availability = availabilityByMaster[masterId];
    if (availability && availability.serviceAvailable === false) {
      setMasterId("");
      setSlotLabel("");
    }
  }, [availabilityByMaster, masterId]);

  const slotGroups = useMemo(() => groupSlotsByDayPeriod(slotsForMaster), [slotsForMaster]);
  const slotByLabel = useMemo(() => new Map(slotsForMaster.map((s) => [s.label, s])), [slotsForMaster]);

  async function submit() {
    setErrorText(null);
    setSuccessId(null);

    if (!studioId) {
      setErrorText("Студия не найдена");
      return;
    }

    if (!serviceId) {
      setErrorText("Выберите услугу");
      return;
    }

    if (!masterId) {
      setErrorText("Выберите мастера");
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

    setSubmitLoading(true);
    try {
      const result = await createBooking({
        providerId: studioId,
        serviceId,
        masterProviderId: masterId,
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        slotLabel: slot.label,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        comment: comment.trim() ? comment.trim() : null,
      });

      if (!result.ok && result.error === "AUTH_REQUIRED") {
        setShowAuthModal(true);
        return;
      }

      if (!result.ok) {
        setErrorText(result.error);
        return;
      }

      setSuccessId(result.bookingId);
      setComment("");
    } finally {
      setSubmitLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">Загружаем студию…</div>
          <div className="mt-2 text-sm text-text-muted">Подготавливаем форму записи.</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !studio) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">Не удалось открыть запись</div>
          <div className="mt-2 text-sm text-text-muted">{error ?? "Студия не найдена"}</div>
          <div className="mt-4">
            <Button variant="secondary" asChild>
              <Link href="/providers">Назад к каталогу</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isDateSelected = Boolean(selectedDate);
  const isServiceSelected = Boolean(serviceId);
  const canShowMasters = isDateSelected && isServiceSelected;

  return (
    <div className="space-y-6">
      <Section
        title="Запись"
        subtitle={`Выберите дату, услугу, мастера и время в студии «${studio.name}».`}
        right={<Badge>до {STUDIO_BOOKING_DAYS_AHEAD} дней вперёд</Badge>}
      />

      <Card className="bg-surface">
        <CardContent className="p-5 md:p-6 space-y-3">
          <div className="text-sm font-semibold text-text">Дата</div>
          <DatePicker
            value={selectedDate}
            min={dateBounds.min}
            max={dateBounds.max}
            onChange={setSelectedDate}
          />
          <div className="text-xs text-text-muted">
            Доступные даты: с {dateBounds.min} по {dateBounds.max}.
          </div>
        </CardContent>
      </Card>

      <Card className={`bg-surface ${isDateSelected ? "" : "opacity-50 pointer-events-none"}`}>
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-text">Услуги</div>
            {!isDateSelected ? (
              <div className="text-xs text-text-muted">Сначала выберите дату</div>
            ) : null}
          </div>
          {studio.services.length === 0 ? (
            <div className="text-sm text-text-muted">Услуги пока не добавлены.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {studio.services.map((service) => {
                const active = service.id === serviceId;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setServiceId(service.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-text bg-text text-white"
                        : "border-border bg-surface hover:border-text/60"
                    }`}
                  >
                    <div className="text-sm font-semibold">{service.name}</div>
                    <div className={`mt-2 text-xs ${active ? "text-white/80" : "text-text-muted"}`}>
                      {minutesToHuman(service.durationMin)}
                    </div>
                    <div className={`mt-1 text-sm ${active ? "text-white" : "text-text"}`}>
                      {service.price > 0 ? moneyRUB(service.price) : "Цена уточняется"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={`bg-surface ${canShowMasters ? "" : "opacity-50 pointer-events-none"}`}>
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-text">Мастера</div>
            {!canShowMasters ? (
              <div className="text-xs text-text-muted">Выберите дату и услугу</div>
            ) : availabilityLoading ? (
              <div className="text-xs text-text-muted">Считаем слоты…</div>
            ) : null}
          </div>

          {canShowMasters && filteredMasters.length === 0 ? (
            <div className="text-sm text-text-muted">По выбранной услуге нет доступных мастеров.</div>
          ) : (
            <div className="grid gap-3">
              {(canShowMasters ? filteredMasters : masters).map((master) => {
                const active = master.id === masterId;
                const availability = availabilityByMaster[master.id];
                const slotsCount = availability?.slots.length ?? 0;
                const hasSlots = slotsCount > 0;
                const slotText = availabilityLoading
                  ? "Считаем слоты"
                  : hasSlots
                    ? `Слотов: ${slotsCount}`
                    : "Нет слотов";

                return (
                  <button
                    key={master.id}
                    type="button"
                    onClick={() => setMasterId(master.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-text bg-text text-white"
                        : "border-border bg-surface hover:border-text/60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-12 w-12 rounded-2xl ${
                          active ? "bg-white/10" : "bg-muted border border-border"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{master.name}</div>
                        <div className={`mt-1 text-xs ${active ? "text-white/80" : "text-text-muted"}`}>
                          {selectedService
                            ? `${minutesToHuman(selectedService.durationMin)} · ${selectedService.price > 0 ? moneyRUB(selectedService.price) : "Цена уточняется"}`
                            : "Данные услуги уточняются"}
                        </div>
                      </div>
                      <div className={`text-xs ${active ? "text-white/80" : "text-text-muted"}`}>
                        {slotText}
                      </div>
                    </div>
                    {availability?.error ? (
                      <div className={`mt-2 text-xs ${active ? "text-white/80" : "text-text-muted"}`}>
                        {availability.error}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={`bg-surface ${masterId ? "" : "opacity-50 pointer-events-none"}`}>
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-text">Слоты</div>
            {!masterId ? (
              <div className="text-xs text-text-muted">Выберите мастера</div>
            ) : availabilityLoading ? (
              <div className="text-xs text-text-muted">Загружаем слоты…</div>
            ) : null}
          </div>

          {availabilityLoading ? (
            <div className="text-sm text-text-muted">Подбираем доступные окна…</div>
          ) : slotGroups.length === 0 ? (
            <div className="text-sm text-text-muted">
              Нет слотов на выбранную дату. Попробуйте другую дату или мастера.
            </div>
          ) : (
            <SlotPicker groups={slotGroups} value={slotLabel} onChange={setSlotLabel} />
          )}
        </CardContent>
      </Card>

      <Card className="bg-surface">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="text-sm font-semibold text-text">Контактные данные</div>

          {meLoading ? (
            <div className="text-sm text-text-muted">Проверяем авторизацию…</div>
          ) : me ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Вы авторизованы
              {me.phone ? <span className="ml-2 text-emerald-700">({me.phone})</span> : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Войдите, чтобы записаться.
              <a href={buildLoginUrl(nextPath)} className="ml-2 underline font-medium">
                Войти
              </a>
            </div>
          )}

          {errorText ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorText}
            </div>
          ) : null}

          {successId ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Заявка отправлена (ID: {successId})
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Имя"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={submitLoading}
            />
            <Input
              placeholder="Телефон"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              disabled={submitLoading}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <Input
            placeholder="Комментарий (необязательно)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={submitLoading}
          />

          <Button
            className="w-full"
            onClick={submit}
            disabled={
              submitLoading ||
              (!meLoading && !me) ||
              !serviceId ||
              !masterId ||
              !slotLabel ||
              !selectedDate
            }
          >
            {submitLoading ? "Отправляем…" : "Записаться"}
          </Button>
        </CardContent>
      </Card>

      {showAuthModal ? (
        <Modal title="Войдите, чтобы записаться" onClose={() => setShowAuthModal(false)}>
          <div className="text-sm text-text-muted">
            Мы принимаем записи только от авторизованных клиентов — так мастерам спокойнее и меньше
            фейковых заявок.
          </div>
          <div className="mt-5 flex gap-3">
            <a
              href={buildLoginUrl(nextPath)}
              className="flex-1 text-center rounded-2xl bg-accent text-[rgb(var(--accent-foreground))] py-2 font-medium"
            >
              Войти
            </a>
            <button
              onClick={() => setShowAuthModal(false)}
              className="flex-1 rounded-2xl border border-border py-2 font-medium text-text"
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
        <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl border border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="text-lg font-semibold text-text">{title}</div>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-text-muted hover:bg-muted"
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
