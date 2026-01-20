"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Tab = "bookings" | "services" | "schedule" | "profile";

export default function ProviderCabinetPage() {
  const [tab, setTab] = useState<Tab>("bookings");

  return (
    <div className="space-y-6">
      <Section
        title="Кабинет мастера"
        subtitle="В MVP — статичные экраны. Дальше подключим API и роли."
        right={
          <Tabs
            value={tab}
            onChange={(id) => {
              if (id === "bookings" || id === "services" || id === "schedule" || id === "profile") setTab(id);
            }}
            items={[
              { id: "bookings", label: "Записи", badge: 5 },
              { id: "services", label: "Услуги", badge: 8 },
              { id: "schedule", label: "Расписание" },
              { id: "profile", label: "Профиль" },
            ]}
          />
        }
      />

      {tab === "bookings" ? (
        <Card><CardContent className="p-6">Тут будет список записей (MVP статично)</CardContent></Card>
      ) : null}

      {tab === "services" ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Мои услуги</div>
              <Button size="sm">Добавить</Button>
            </div>
            <div className="text-sm text-neutral-600">Дальше подключим CRUD услуг.</div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "schedule" ? (
        <Card><CardContent className="p-6">Тут будет расписание (рабочие часы/исключения)</CardContent></Card>
      ) : null}

      {tab === "profile" ? (
        <Card><CardContent className="p-6">Тут будет профиль (описание, адрес, фото работ)</CardContent></Card>
      ) : null}
    </div>
  );
}
