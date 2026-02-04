"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type SlotItem = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
};

type Props = {
  providerId: string;
  selectedServices: ProviderServiceDto[];
  onRemove: (serviceId: string) => void;
};

type MeUser = {
  displayName: string | null;
  phone: string | null;
};

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function PublicBookingWidget({ providerId, selectedServices, onRemove }: Props) {
  const isEmpty = selectedServices.length <= 0;
  const totalPrice = selectedServices.reduce((sum, service) => sum + Math.max(0, service.price), 0);
  const totalDuration = selectedServices.reduce((sum, service) => sum + Math.max(0, service.durationMin), 0);

  const [step, setStep] = useState<"summary" | "slots" | "checkout">("summary");
  const [rangeStart, setRangeStart] = useState<Date>(() => startOfDay(new Date()));
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlotLabel, setSelectedSlotLabel] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const slotServiceId = selectedServices[0]?.id ?? null;
  const dayKeys = useMemo(() => [0, 1, 2].map((offset) => toDateKey(addDays(rangeStart, offset))), [rangeStart]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, SlotItem[]>();
    for (const day of dayKeys) map.set(day, []);

    for (const slot of slots) {
      const [day] = slot.label.split(" ");
      if (!day) continue;
      const current = map.get(day) ?? [];
      current.push(slot);
      map.set(day, current);
    }

    return map;
  }, [dayKeys, slots]);

  const slotsForSelectedDate = selectedDate ? slotsByDay.get(selectedDate) ?? [] : [];
  const selectedSlot = useMemo(() => slots.find((slot) => slot.label === selectedSlotLabel) ?? null, [selectedSlotLabel, slots]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      setMeLoading(true);
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { user: MeUser | null } }
          | { ok: false; error: { message: string } }
          | null;

        if (!res.ok || !json || !json.ok) {
          if (!cancelled) setMe(null);
          return;
        }

        if (!cancelled) {
          setMe(json.data.user);
          if (json.data.user?.phone) setGuestPhone(json.data.user.phone);
        }
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "slots" || !slotServiceId) return;

    let cancelled = false;
    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const from = startOfDay(rangeStart);
        const to = addDays(from, 3);
        const url = new URL(`/api/masters/${providerId}/availability`, window.location.origin);
        url.searchParams.set("serviceId", slotServiceId);
        url.searchParams.set("from", from.toISOString());
        url.searchParams.set("to", to.toISOString());

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { slots: SlotItem[] } }
          | { ok: false; error: { message: string } }
          | null;

        if (!res.ok || !json || !json.ok) {
          throw new Error(UI_TEXT.publicProfile.slots.loadFailed);
        }

        if (cancelled) return;

        const loadedSlots = json.data.slots;
        setSlots(loadedSlots);

        const firstDayWithSlots = dayKeys.find((key) =>
          loadedSlots.some((slot) => slot.label.startsWith(`${key} `))
        );
        setSelectedDate(firstDayWithSlots ?? dayKeys[0] ?? "");
        setSelectedSlotLabel("");
      } catch {
        if (!cancelled) {
          setSlots([]);
          setSlotsError(UI_TEXT.publicProfile.slots.loadFailed);
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [dayKeys, providerId, rangeStart, slotServiceId, step]);

  useEffect(() => {
    if (isEmpty && (step === "slots" || step === "checkout")) {
      setStep("summary");
    }
  }, [isEmpty, step]);

  function buildLoginUrl(): string {
    if (typeof window === "undefined") return "/login";
    const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const params = new URLSearchParams({ next: nextPath });
    return `/login?${params.toString()}`;
  }

  async function onConfirmBooking() {
    if (!selectedSlot || !slotServiceId) return;

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const clientName = me?.displayName?.trim() || UI_TEXT.publicProfile.booking.clientFallbackName;
      const clientPhone = me?.phone?.trim() || guestPhone.trim();
      if (!clientPhone) {
        setSubmitError(UI_TEXT.publicProfile.booking.authRequiredHint);
        return;
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          serviceId: slotServiceId,
          startAtUtc: selectedSlot.startAtUtc,
          endAtUtc: selectedSlot.endAtUtc,
          slotLabel: selectedSlot.label,
          clientName,
          clientPhone,
          comment: comment.trim() ? comment.trim() : null,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { booking: { id: string } } }
        | { ok: false; error: { message: string } }
        | null;

      if (!res.ok || !json || !json.ok) {
        throw new Error(UI_TEXT.publicProfile.booking.submitFailed);
      }

      setSubmitSuccess(UI_TEXT.publicProfile.booking.success);
    } catch {
      setSubmitError(UI_TEXT.publicProfile.booking.submitFailed);
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className="lux-card rounded-[26px] p-5 text-text-main">
      <div className="text-lg font-semibold">{UI_TEXT.publicProfile.booking.title}</div>

      {step === "summary" && isEmpty ? (
        <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/70 p-4">
          <div className="text-sm font-medium">{UI_TEXT.publicProfile.booking.emptyTitle}</div>
          <div className="mt-2 text-sm text-text-sec">{UI_TEXT.publicProfile.booking.emptyDesc}</div>
        </div>
      ) : null}

      {step === "summary" && !isEmpty ? (
        <div className="mt-4 space-y-3">
          {selectedServices.map((service) => (
            <div key={service.id} className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{service.name}</div>
                  <div className="mt-1 text-xs text-text-sec">
                    {service.price > 0
                      ? `${new Intl.NumberFormat("ru-RU").format(service.price)} ₽`
                      : UI_TEXT.publicProfile.services.priceOnRequest}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(service.id)}
                  className="rounded-md border border-border-subtle px-2 py-1 text-xs transition hover:bg-bg-card"
                >
                  {UI_TEXT.publicProfile.services.remove}
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-sec">{UI_TEXT.publicProfile.booking.total}</span>
              <span>{UI_FMT.totalLabel(totalPrice)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-text-sec">{UI_TEXT.publicProfile.booking.duration}</span>
              <span>{UI_FMT.durationLabel(totalDuration)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {step === "slots" ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setRangeStart((prev) => addDays(prev, -7))}
              className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs transition hover:bg-bg-card"
            >
              {UI_TEXT.publicProfile.slots.prevWeek}
            </button>
            <button
              type="button"
              onClick={() => setRangeStart((prev) => addDays(prev, 7))}
              className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs transition hover:bg-bg-card"
            >
              {UI_TEXT.publicProfile.slots.nextWeek}
            </button>
          </div>

          {slotsLoading ? <div className="text-sm text-text-sec">{UI_TEXT.publicProfile.slots.loadingSlots}</div> : null}
          {slotsError ? <div className="text-sm text-text-sec">{slotsError}</div> : null}

          {!slotsLoading && !slotsError ? (
            <>
              <div>
                <div className="mb-2 text-xs text-text-sec">{UI_TEXT.publicProfile.slots.chooseDay}</div>
                <div className="flex flex-wrap gap-2">
                  {dayKeys.map((dayKey) => {
                    const daySlots = slotsByDay.get(dayKey) ?? [];
                    const active = selectedDate === dayKey;
                    return (
                      <button
                        key={dayKey}
                        type="button"
                        onClick={() => {
                          setSelectedDate(dayKey);
                          setSelectedSlotLabel("");
                        }}
                        className={`rounded-lg border px-2 py-1 text-xs transition ${
                          active ? "border-primary/60 bg-primary text-[rgb(var(--accent-foreground))]" : "border-border-subtle bg-bg-input hover:bg-bg-card"
                        }`}
                      >
                        {new Date(dayKey).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} ({daySlots.length})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs text-text-sec">{UI_TEXT.publicProfile.slots.chooseSlot}</div>
                {slotsForSelectedDate.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {slotsForSelectedDate.map((slot) => {
                      const active = selectedSlotLabel === slot.label;
                      const time = slot.label.split(" ")[1] ?? slot.label;
                      return (
                        <button
                          key={slot.label}
                          type="button"
                          onClick={() => setSelectedSlotLabel(slot.label)}
                          className={`rounded-lg border px-2 py-1 text-xs transition ${
                            active ? "border-primary/60 bg-primary text-[rgb(var(--accent-foreground))]" : "border-border-subtle bg-bg-input hover:bg-bg-card"
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-text-sec">
                    {slots.length > 0 ? UI_TEXT.publicProfile.slots.noSlotsForDay : UI_TEXT.publicProfile.slots.noSlots}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {step === "checkout" ? (
        <div className="mt-4 space-y-3">
          {meLoading ? <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div> : null}
          {!meLoading && me?.phone ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm">
              {UI_TEXT.publicProfile.booking.bookingOnPhone}: <span className="font-medium">{me.phone}</span>
            </div>
          ) : null}

          {!meLoading && !me ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-main">
              <div className="font-medium">{UI_TEXT.publicProfile.booking.authRequiredTitle}</div>
              <div className="mt-1 text-text-sec">{UI_TEXT.publicProfile.booking.authRequiredHint}</div>
              <label className="mt-3 block text-xs text-text-sec">{UI_TEXT.publicProfile.booking.phoneLabel}</label>
              <input
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
                placeholder={UI_TEXT.publicProfile.booking.phonePlaceholder}
                className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-sec"
              />
              <a
                href={buildLoginUrl()}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-sm font-semibold text-text-main transition hover:shadow-card"
              >
                {UI_TEXT.publicProfile.booking.loginAndContinue}
              </a>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs text-text-sec">{UI_TEXT.publicProfile.booking.comment}</label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={UI_TEXT.publicProfile.booking.commentPlaceholder}
              className="lux-input min-h-[84px] w-full rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-sec"
            />
          </div>

          {submitError ? <div className="text-sm text-red-300">{submitError}</div> : null}
          {submitSuccess ? <div className="text-sm text-emerald-300">{submitSuccess}</div> : null}
        </div>
      ) : null}

      {step === "summary" ? (
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => setStep("slots")}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-semibold text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {UI_TEXT.publicProfile.booking.chooseTime}
        </button>
      ) : step === "slots" ? (
        <button
          type="button"
          disabled={!selectedSlot}
          onClick={() => setStep("checkout")}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-semibold text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {UI_TEXT.publicProfile.booking.continueToConfirm}
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={submitLoading || !selectedSlot || (!me && !guestPhone.trim())}
            onClick={() => void onConfirmBooking()}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-semibold text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {UI_TEXT.publicProfile.booking.confirm}
          </button>
          <button
            type="button"
            onClick={() => setStep("slots")}
            className="mt-2 w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-bg-card"
          >
            {UI_TEXT.publicProfile.booking.chooseTime}
          </button>
        </>
      )}
    </div>
  );
}

