"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";

import { providerFullMock } from "@/features/provider/data/mock";
import { ProviderHeader } from "@/features/provider/components/provider-header";
import { WorksGrid } from "@/features/provider/components/works-grid";
import { ServicesList } from "@/features/provider/components/services-list";

import { slotsMock } from "@/features/booking/data/mock";
import { SlotPicker } from "@/features/booking/components/slot-picker";
import { moneyRUB, minutesToHuman } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

function ReviewsMock({
  providerName,
}: {
  providerName: string;
}) {
  const items = [
    { name: "Анна", text: "Очень аккуратно, быстро и комфортно. Вернусь!", rating: 5 },
    { name: "Илья", text: "Понравилась консультация и результат. Рекомендую.", rating: 5 },
    { name: "Мария", text: "Все чисто, стерильно, мастер внимательный.", rating: 4 },
  ];

  return (
    <div className="space-y-3">
      {items.map((r, i) => (
        <Card key={i} className="hover:shadow-sm transition">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-neutral-900">{r.name}</div>
                <div className="mt-1 text-xs text-neutral-500">Отзыв о {providerName}</div>
              </div>
              <Badge>★ {r.rating}.0</Badge>
            </div>
            <p className="mt-3 text-sm text-neutral-700">{r.text}</p>
          </CardContent>
        </Card>
      ))}
      <div className="text-xs text-neutral-500">
        В MVP отзывы статичные. Потом подключим реальные, модерацию и сортировку.
      </div>
    </div>
  );
}

export default function ProviderPage() {
  const params = useParams<{ id: string }>();
  const p = providerFullMock[params.id];

  const [tab, setTab] = useState<"works" | "services" | "reviews">("services");

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const service = useMemo(() => p?.services.find((s) => s.id === serviceId), [p, serviceId]);

  if (!p) return notFound();

  const canPickSlot = !!serviceId;
  const canBook = !!serviceId && !!slot;

  const bookingHref =
    canBook ? `/booking/${p.id}?serviceId=${encodeURIComponent(serviceId!)}&slot=${encodeURIComponent(slot!)}` : "#";

  return (
    <div className="space-y-8">
      <ProviderHeader
        name={p.name}
        tagline={p.tagline}
        rating={p.rating}
        reviews={p.reviews}
        district={p.district}
        address={p.address}
        categories={p.categories}
      />

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(id) => {
            if (id === "works" || id === "services" || id === "reviews") setTab(id);
          }}
          items={[
            { id: "services", label: "Услуги", badge: p.services.length },
            { id: "works", label: "Работы", badge: p.works.length },
            { id: "reviews", label: "Отзывы", badge: p.reviews },
          ]}
        />

        <div className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{p.rating.toFixed(1)}</span> ★ · {p.reviews} отзывов
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
        {/* LEFT */}
        <div className="space-y-8">
          {tab === "works" ? (
            <Section title="Работы" subtitle="В MVP это плейсхолдеры (потом будут реальные фото).">
              <WorksGrid works={p.works} />
            </Section>
          ) : null}

          {tab === "services" ? (
            <Section title="Услуги" subtitle="Выбери услугу — после этого станет доступен выбор времени.">
              <ServicesList
                services={p.services}
                pickedId={serviceId}
                onPick={(id) => {
                  setServiceId(id);
                  setSlot(null);
                }}
              />
            </Section>
          ) : null}

          {tab === "reviews" ? (
            <Section title="Отзывы" subtitle="Социальное доказательство. Потом подключим реальные отзывы.">
              <ReviewsMock providerName={p.name} />
            </Section>
          ) : null}
        </div>

        {/* RIGHT: booking sidebar */}
        <div className="space-y-4 lg:sticky lg:top-24 h-fit">
          <Card>
            <CardContent className="p-5 md:p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Запись</div>
                <div className="mt-1 text-xs text-neutral-500">Шаг 1: услуга · Шаг 2: время · Шаг 3: подтверждение</div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Выбрано</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">
                  {service ? service.name : "Сначала выбери услугу"}
                </div>
                {service ? (
                  <div className="mt-2 text-xs text-neutral-600">
                    {minutesToHuman(service.durationMin)} · {moneyRUB(service.price)}
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-neutral-600">{slot ? `Время: ${slot}` : "Время: —"}</div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500">Свободное время</div>
                <SlotPicker
                  groups={slotsMock}
                  value={slot ?? undefined}
                  onChange={setSlot}
                  disabled={!canPickSlot}
                />
                {!canPickSlot ? (
                  <div className="text-xs text-neutral-500">Чтобы выбрать время — сначала выбери услугу.</div>
                ) : null}
              </div>

              <Button className="w-full" disabled={!canBook} asChild>
                <Link href={bookingHref}>Перейти к подтверждению</Link>
              </Button>

              <div className="text-xs text-neutral-500">
                MVP-логика: дальше сделаем PENDING на 10 минут + защита от двойных броней.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-neutral-900">Локация</div>
              <div className="mt-3 h-40 rounded-2xl bg-neutral-100" />
              <div className="mt-3 text-xs text-neutral-500">{p.address}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
