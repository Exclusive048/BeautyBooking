"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { makeMockSlots, type Slot } from "@/features/booking/data/slots";
import { moneyRUB, minutesToHuman } from "@/lib/format";

type ServiceLite = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
};

export function BookingWidget({
  providerId,
  services,
}: {
  providerId: string;
  services: ServiceLite[];
}) {
  const slots = useMemo(() => makeMockSlots(), []);

  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [slot, setSlot] = useState<Slot | null>(slots[0] ?? null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [comment, setComment] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  async function submit() {
    setError(null);
    setSuccess(null);

    if (!serviceId) return setError("Выбери услугу");
    if (!slot) return setError("Выбери время");
    if (!clientName.trim()) return setError("Введите имя");
    if (!clientPhone.trim()) return setError("Введите телефон");

    try {
      setLoading(true);

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          serviceId,
          slotLabel: slot.label,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          comment: comment.trim() ? comment.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `API error: ${res.status}`);

      setSuccess("Заявка отправлена! В MVP: статус 'Ожидает'.");
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать запись");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-5 md:p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Запись онлайн</div>
          <div className="mt-1 text-xs text-neutral-500">
            MVP: слоты статичные. Дальше подключим реальное расписание и блокировки.
          </div>
        </div>

        {/* Service */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500">Услуга</div>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const active = s.id === serviceId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className={[
                    "rounded-2xl border px-3 py-2 text-left transition",
                    active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white hover:bg-neutral-50",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className={["mt-1 text-xs", active ? "text-white/80" : "text-neutral-500"].join(" ")}>
                    {minutesToHuman(s.durationMin)} · {moneyRUB(s.price)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Slots */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500">Время</div>
          <div className="flex flex-wrap gap-2">
            {slots.map((t) => {
              const active = slot?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSlot(t)}
                  className={[
                    "rounded-2xl border px-3 py-2 text-sm transition",
                    active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white hover:bg-neutral-50",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Client */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-500">Имя</div>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Например, Мария" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-500">Телефон</div>
            <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+7 ..." />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500">Комментарий (необязательно)</div>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Пожелания, особенности..." />
        </div>

        {/* Summary */}
        {selectedService ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-900">Итого</div>
              <Badge>{moneyRUB(selectedService.price)}</Badge>
            </div>
            <div className="mt-2 text-xs text-neutral-600">
              {selectedService.name} · {minutesToHuman(selectedService.durationMin)} · {slot?.label ?? "—"}
            </div>
          </div>
        ) : null}

        {/* Alerts */}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {success ? <div className="text-sm text-green-700">{success}</div> : null}

        <Button onClick={submit} disabled={loading}>
          {loading ? "Отправляем..." : "Записаться"}
        </Button>
      </CardContent>
    </Card>
  );
}
