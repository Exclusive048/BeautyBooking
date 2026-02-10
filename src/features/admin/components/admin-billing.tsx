"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiResponse } from "@/lib/types/api";

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  price: number;
  features: Record<string, boolean>;
  isActive: boolean;
  updatedAt: string;
};

type BillingResponse = {
  plans: BillingPlan[];
};

const FEATURE_LABELS: Record<string, string> = {
  profile: "Профиль в каталоге",
  portfolio: "Портфолио",
  onlineBooking: "Онлайн запись",
  smsReminders: "SMS / push напоминания",
  bookingLink: "Ссылка на запись",
  windowGenerator: "Генерация «окошек»",
  priorityListing: "Приоритет в выдаче",
  proBadge: "Бейдж Pro",
  broadcasts: "Рассылки по своей базе",
  multiStaff: "Несколько сотрудников",
  sharedCalendar: "Общий календарь",
};

function formatPrice(price: number) {
  if (price <= 0) return "Бесплатно";
  return `${new Intl.NumberFormat("ru-RU").format(price)} ₸/мес`;
}

export function AdminBilling() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<BillingPlan | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPrice, setEditingPrice] = useState("");
  const [editingFeatures, setEditingFeatures] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<BillingResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить тарифы");
      }
      setPlans(json.data.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить тарифы");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (plan: BillingPlan) => {
    setActivePlan(plan);
    setEditingName(plan.name);
    setEditingPrice(String(plan.price));
    setEditingFeatures(plan.features ?? {});
  };

  const closeEdit = () => {
    setActivePlan(null);
    setEditingName("");
    setEditingPrice("");
    setEditingFeatures({});
  };

  const featureKeys = useMemo(() => Object.keys(FEATURE_LABELS), []);

  const savePlan = async () => {
    if (!activePlan) return;
    setSaving(true);
    setError(null);
    const priceValue = Number(editingPrice);
    if (Number.isNaN(priceValue) || priceValue < 0) {
      setError("Введите корректную цену.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activePlan.id,
          name: editingName,
          price: priceValue,
          features: editingFeatures,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось сохранить тариф");
      }
      await load();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить тариф");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Финансы и тарифы</h1>
        <p className="mt-1 text-sm text-text-sec">Управляйте тарифными планами и платежной логикой.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-main">Тарифные планы</h2>

        {loading ? (
          <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-text-main">{plan.name}</div>
                      <div className="mt-1 text-sm text-text-sec">{plan.code}</div>
                    </div>
                    <div className="text-sm font-semibold text-text-main">{formatPrice(plan.price)}</div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <ul className="space-y-2 text-sm text-text-sec">
                    {featureKeys.map((key) => (
                      <li key={key} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${plan.features?.[key] ? "bg-emerald-500" : "bg-neutral-300"}`} />
                        <span className={plan.features?.[key] ? "text-text-main" : "text-text-sec"}>
                          {FEATURE_LABELS[key]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(plan)}>
                      Редактировать
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-main">История транзакций</h2>
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">
          История транзакций появится позже.
        </div>
      </section>

      <ModalSurface open={Boolean(activePlan)} onClose={closeEdit} title="Редактировать тариф">
        {activePlan ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-sec">Название</label>
                <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-sec">Цена (₸/мес)</label>
                <Input
                  value={editingPrice}
                  onChange={(e) => setEditingPrice(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-sec">Функции</div>
              <div className="grid gap-2 md:grid-cols-2">
                {featureKeys.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-text-main">
                    <input
                      type="checkbox"
                      checked={Boolean(editingFeatures[key])}
                      onChange={(event) =>
                        setEditingFeatures((prev) => ({ ...prev, [key]: event.target.checked }))
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    {FEATURE_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeEdit} disabled={saving}>
                Отмена
              </Button>
              <Button onClick={savePlan} disabled={saving}>
                {saving ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>
    </section>
  );
}
