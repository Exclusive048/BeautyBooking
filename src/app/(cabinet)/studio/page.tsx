"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/ui/section";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moneyRUB } from "@/lib/format";
import { RoleGuard } from "@/features/auth/components/role-guard";
import { AccountChip } from "@/features/auth/components/account-chip";

type Tab = "bookings" | "masters" | "services" | "profile";

const studioMastersMock = [
  { id: "m1", name: "Айгерим", role: "Brow-мастер", status: "ACTIVE" as const },
  { id: "m2", name: "Алина", role: "Ногти", status: "ACTIVE" as const },
  { id: "m3", name: "Карина", role: "Визаж", status: "INVITED" as const },
];

const studioServicesMock = [
  { id: "s1", name: "Маникюр + покрытие", duration: "120 мин", price: 3500, masters: ["Алина"] },
  { id: "s2", name: "Коррекция бровей", duration: "45 мин", price: 1700, masters: ["Айгерим"] },
  { id: "s3", name: "Макияж дневной", duration: "60 мин", price: 5000, masters: ["Карина"] },
];

const studioBookingsMock = [
  { id: "b1", time: "Сегодня · 12:30", service: "Коррекция бровей", master: "Айгерим", client: "Мария" },
  { id: "b2", time: "Сегодня · 16:00", service: "Маникюр + покрытие", master: "Алина", client: "София" },
];

function SmallStatus({ v }: { v: "ACTIVE" | "INVITED" | "DISABLED" }) {
  if (v === "ACTIVE") return <Badge>Активен</Badge>;
  if (v === "INVITED") return <Badge>Приглашён</Badge>;
  return <Badge>Отключён</Badge>;
}

export default function StudioCabinetPage() {
  const [tab, setTab] = useState<Tab>("bookings");

  const stats = useMemo(() => {
    return {
      masters: studioMastersMock.length,
      services: studioServicesMock.length,
      bookings: studioBookingsMock.length,
    };
  }, []);

  return (
    <RoleGuard allow={["STUDIO_ADMIN"]}>
    <div className="space-y-6">
      <Section
        title="Кабинет студии"
        subtitle="Управляй мастерами, услугами и записями (всё в одном месте)."
        right={
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
            <AccountChip />
            <Tabs
            value={tab}
            onChange={(id) => {
                if (id === "bookings" || id === "masters" || id === "services" || id === "profile") setTab(id);
            }}
            items={[
                { id: "bookings", label: "Записи", badge: stats.bookings },
                { id: "masters", label: "Мастера", badge: stats.masters },
                { id: "services", label: "Услуги", badge: stats.services },
                { id: "profile", label: "Профиль" },
            ]}
            />
        </div>
        }

      />

      {/* KPI row */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="bg-white">
          <CardContent className="p-5">
            <div className="text-xs text-neutral-500">Мастеров</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-900">{stats.masters}</div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-5">
            <div className="text-xs text-neutral-500">Услуг</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-900">{stats.services}</div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-5">
            <div className="text-xs text-neutral-500">Записей сегодня</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-900">{stats.bookings}</div>
          </CardContent>
        </Card>
      </div>

      {tab === "bookings" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Записи студии</div>
                <div className="mt-1 text-xs text-neutral-500">В MVP без фильтров, позже добавим фильтр по мастеру.</div>
              </div>
              <Button size="sm">Экспорт</Button>
            </div>

            <div className="space-y-3">
              {studioBookingsMock.map((b) => (
                <div key={b.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{b.service}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {b.time} · Мастер: <span className="font-medium">{b.master}</span> · Клиент:{" "}
                        <span className="font-medium">{b.client}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary">Перенести</Button>
                      <Button size="sm" variant="secondary">Отменить</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "masters" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Мастера</div>
                <div className="mt-1 text-xs text-neutral-500">Админ добавляет мастеров и назначает им услуги.</div>
              </div>
              <Button size="sm">Добавить мастера</Button>
            </div>

            <div className="space-y-3">
              {studioMastersMock.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">{m.name}</div>
                    <div className="mt-1 text-xs text-neutral-500">{m.role}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SmallStatus v={m.status} />
                    <Button size="sm" variant="secondary">Настроить</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "services" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Услуги студии</div>
                <div className="mt-1 text-xs text-neutral-500">К услуге можно привязать нескольких мастеров.</div>
              </div>
              <Button size="sm">Добавить услугу</Button>
            </div>

            <div className="space-y-3">
              {studioServicesMock.map((s) => (
                <div key={s.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{s.name}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {s.duration} · от <span className="font-medium text-neutral-700">{moneyRUB(s.price)}</span>
                      </div>
                      <div className="mt-2 text-xs text-neutral-500">
                        Мастера: <span className="font-medium text-neutral-700">{s.masters.join(", ")}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary">Назначить мастеров</Button>
                      <Button size="sm" variant="secondary">Редактировать</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "profile" ? (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="text-sm font-semibold text-neutral-900">Профиль студии</div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Название</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">Studio Velvet</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-500">Адрес</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">пр-т Достык, 17</div>
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
