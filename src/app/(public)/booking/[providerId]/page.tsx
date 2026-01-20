"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { providerFullMock } from "@/features/provider/data/mock";
import { moneyRUB, minutesToHuman } from "@/lib/format";

export default function BookingConfirmPage() {
  const params = useParams<{ providerId: string }>();
  const sp = useSearchParams();

  const providerId = params.providerId;
  const serviceId = sp.get("serviceId");
  const slot = sp.get("slot");

  const p = providerFullMock[providerId];
  const service = p?.services.find((s) => s.id === serviceId);

  return (
    <div className="max-w-2xl space-y-6">
      <Section title="Подтверждение записи" subtitle="В MVP — просто форма со статикой. Далее подключим API." />

      <Card>
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Имя" />
            <Input placeholder="Телефон" />
          </div>
          <Input placeholder="Комментарий (необязательно)" />

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <div className="font-semibold text-neutral-900">Сводка</div>
            <div className="mt-2">Мастер/студия: <span className="font-semibold">{p?.name ?? "—"}</span></div>
            <div>Услуга: <span className="font-semibold">{service?.name ?? "—"}</span></div>
            <div>Длительность: <span className="font-semibold">{service ? minutesToHuman(service.durationMin) : "—"}</span></div>
            <div>Цена: <span className="font-semibold">{service ? moneyRUB(service.price) : "—"}</span></div>
            <div>Время: <span className="font-semibold">{slot ?? "—"}</span></div>
            <div className="mt-2 text-xs text-neutral-500">{p?.address ?? ""}</div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className="flex-1">Отправить заявку</Button>
            <Button variant="secondary" asChild>
              <Link href={p ? `/providers/${p.id}` : "/providers"}>Назад</Link>
            </Button>
          </div>

          <p className="text-xs text-neutral-500">
            В проде: POST /bookings → статус PENDING(10 мин) → уведомление мастеру → подтверждение → CONFIRMED.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
