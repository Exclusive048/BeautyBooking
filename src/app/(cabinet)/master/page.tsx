"use client";

import { useState } from "react";
import { Section } from "@/components/ui/section";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/features/auth/components/role-guard";
import { AccountChip } from "@/features/auth/components/account-chip";

type Tab = "bookings" | "schedule" | "portfolio" | "profile";

const bookingsMock = [
  { id: "b1", time: "Сегодня · 12:30", service: "Коррекция бровей", client: "Алина", status: "CONFIRMED" as const },
  { id: "b2", time: "Сегодня · 15:00", service: "Ламинирование бровей", client: "Мария", status: "PENDING" as const },
  { id: "b3", time: "Завтра · 11:30", service: "Окрашивание бровей", client: "Екатерина", status: "CONFIRMED" as const },
];

function StatusBadge({ status }: { status: "CONFIRMED" | "PENDING" | "CANCELLED" }) {
  if (status === "CONFIRMED") return <Badge>Подтверждено</Badge>;
  if (status === "PENDING") return <Badge>Ожидает</Badge>;
  return <Badge>Отменено</Badge>;
}

export default function MasterCabinetPage() {
  const [tab, setTab] = useState<Tab>("bookings");

  return (
    <RoleGuard allow={["MASTER_SOLO", "MASTER_IN_STUDIO"]}>
    <div className="space-y-6">
      <Section
        title="Кабинет мастера"
        subtitle="Ты видишь только свои записи и своё расписание."
        right={
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
                <AccountChip />
                <Tabs
                value={tab}
                onChange={(id) => {
                    if (id === "bookings" || id === "schedule" || id === "portfolio" || id === "profile") setTab(id);
                }}
                items={[
                    { id: "bookings", label: "Записи", badge: bookingsMock.length },
                    { id: "schedule", label: "Расписание" },
                    { id: "portfolio", label: "Работы" },
                    { id: "profile", label: "Профиль" },
                ]}
                />
            </div>
        }

      />

      {tab === "bookings" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Ближайшие записи</div>
                <div className="mt-1 text-xs text-neutral-500">В MVP список статичный. Потом подключим статусы и API.</div>
              </div>
              <Button size="sm">Обновить</Button>
            </div>

            <div className="space-y-3">
              {bookingsMock.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-900">{b.service}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {b.time} · Клиент: <span className="font-medium text-neutral-700">{b.client}</span>
                      </div>
                    </div>
                    <StatusBadge status={b.status === "PENDING" ? "PENDING" : "CONFIRMED"} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary">Перенести</Button>
                    <Button size="sm" variant="secondary">Отменить</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "schedule" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Моё расписание</div>
                <div className="mt-1 text-xs text-neutral-500">Потом добавим рабочие часы и исключения.</div>
              </div>
              <Button size="sm">Изменить</Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Будни</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">10:00 – 19:00</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Выходные</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">по записи</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "portfolio" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Работы</div>
                <div className="mt-1 text-xs text-neutral-500">Фото-портфолио мастера.</div>
              </div>
              <Button size="sm">Добавить фото</Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-neutral-100 border border-neutral-200" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "profile" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="text-sm font-semibold text-neutral-900">Профиль</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Отображаемое имя</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">Айгерим</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Специализация</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">Брови / Ресницы</div>
              </div>
            </div>
            <Button>Сохранить</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
    </RoleGuard>
  );
}
