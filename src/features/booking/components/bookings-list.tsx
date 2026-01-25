"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moneyRUB, minutesToHuman } from "@/lib/format";
import type { BookingItem } from "../model/types";

function statusLabel(s: BookingItem["status"]) {
  if (s === "PENDING") return "Ожидает";
  if (s === "CONFIRMED") return "Подтверждена";
  return "Отменена";
}

export function BookingsList({ providerId }: { providerId: string }) {
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/bookings?providerId=${encodeURIComponent(providerId)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) throw new Error(data?.message ?? `API error: ${res.status}`);

      setItems(Array.isArray(data) ? (data as BookingItem[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-neutral-900">Загрузка записей…</div>
          <div className="mt-2 text-sm text-neutral-600">Тянем из Supabase.</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-neutral-900">Ошибка</div>
          <div className="mt-2 text-sm text-neutral-600">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-neutral-600">
          Записей: <span className="font-semibold text-neutral-900">{items.length}</span>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-xs text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
        >
          Обновить
        </button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-semibold text-neutral-900">Пока записей нет</div>
            <div className="mt-2 text-sm text-neutral-600">
              Создай запись из профиля провайдера — и она появится здесь.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((b) => (
            <Card key={b.id} className="bg-white">
              <CardContent className="p-5 md:p-6 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900">{b.service.name}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {minutesToHuman(b.service.durationMin)} · {moneyRUB(b.service.price)}
                    </div>
                  </div>
                  <Badge>{statusLabel(b.status)}</Badge>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="text-sm font-semibold text-neutral-900">{b.slotLabel}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Клиент: {b.clientName} · {b.clientPhone}
                  </div>
                  {b.comment ? <div className="mt-2 text-xs text-neutral-600">Комментарий: {b.comment}</div> : null}
                </div>

                <div className="text-xs text-neutral-500">
                  Провайдер: {b.provider.name}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
