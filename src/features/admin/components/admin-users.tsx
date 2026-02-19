"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";

type PlanInfo = {
  id: string;
  code: string;
  name: string;
  scope: "MASTER" | "STUDIO";
  tier: string;
};

type UserItem = {
  id: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  roles: string[];
  type: "client" | "master" | "studio";
  createdAt: string;
  subscriptions: Array<{
    scope: "MASTER" | "STUDIO";
    status: string;
    currentPeriodEnd: string | null;
    plan: PlanInfo;
  }>;
};

type UsersResponse = {
  users: UserItem[];
  summary: {
    total: number;
    clients: number;
    masters: number;
    studios: number;
  };
};

type BillingResponse = {
  plans: PlanInfo[];
};

function formatDate(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
}

function formatRoles(roles: string[]) {
  if (!roles.length) return "—";
  return roles.join(", ");
}

function typeLabel(type: UserItem["type"]) {
  if (type === "master") return "Мастер";
  if (type === "studio") return "Студия";
  return "Клиент";
}

export function AdminUsers() {
  const viewerTimeZone = useViewerTimeZoneContext();
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState<UsersResponse | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<UserItem | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [savingPlan, setSavingPlan] = useState(false);

  const loadPlans = useCallback(async () => {
    const res = await fetch("/api/admin/billing", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ApiResponse<BillingResponse> | null;
    if (!res.ok || !json || !json.ok) {
      throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить тарифы");
    }
    return json.data.plans;
  }, []);

  const loadUsers = useCallback(async (nextFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextFilter && nextFilter !== "all") {
        params.set("filter", nextFilter);
      }
      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<UsersResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось загрузить пользователей");
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить пользователей");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers(filter);
  }, [filter, loadUsers]);

  useEffect(() => {
    void loadPlans().then(setPlans).catch(() => null);
  }, [loadPlans]);

  useEffect(() => {
    if (activeUser && !selectedPlanId && plans.length > 0) {
      setSelectedPlanId(activeUser.subscriptions[0]?.plan.id ?? plans[0].id);
    }
  }, [activeUser, plans, selectedPlanId]);

  const openModal = (user: UserItem) => {
    setActiveUser(user);
    setSelectedPlanId(user.subscriptions[0]?.plan.id ?? plans[0]?.id ?? "");
  };

  const closeModal = () => {
    setActiveUser(null);
    setSelectedPlanId("");
  };

  const savePlan = async () => {
    if (!activeUser || !selectedPlanId) return;
    setSavingPlan(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: activeUser.id, planId: selectedPlanId }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось обновить тариф");
      }
      await loadUsers(filter);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить тариф");
    } finally {
      setSavingPlan(false);
    }
  };

  const summary = data?.summary;

  const tabs = useMemo(
    () => [
      { id: "all", label: "Все", badge: summary?.total ?? 0 },
      { id: "masters", label: "Мастера", badge: summary?.masters ?? 0 },
      { id: "studios", label: "Студии", badge: summary?.studios ?? 0 },
      { id: "clients", label: "Клиенты", badge: summary?.clients ?? 0 },
    ],
    [summary]
  );

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Пользователи</h1>
        <p className="mt-1 text-sm text-text-sec">Все аккаунты системы и управление тарифами.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <Tabs items={tabs} value={filter} onChange={setFilter} />

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка…</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                <th className="px-4 py-3 text-left">Имя</th>
                <th className="px-4 py-3 text-left">Телефон</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Роли</th>
                <th className="px-4 py-3 text-left">Тип</th>
                <th className="px-4 py-3 text-left">Регистрация</th>
                <th className="px-4 py-3 text-right">Тариф</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.length ? (
                data.users.map((user, index) => (
                  <tr key={user.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                    <td className="px-4 py-3 text-sm text-text-main">{user.displayName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{user.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{user.email || "—"}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{formatRoles(user.roles)}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{typeLabel(user.type)}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">
                      {formatDate(user.createdAt, viewerTimeZone)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="flex flex-col items-end gap-1 text-xs text-text-sec">
                          {user.subscriptions.length > 0 ? (
                            user.subscriptions.map((subscription) => (
                              <span key={`${user.id}:${subscription.scope}`}>
                                {subscription.scope}: {subscription.plan.name}
                              </span>
                            ))
                          ) : (
                            <span>FREE</span>
                          )}
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => openModal(user)}>
                          Изменить тариф
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-sec">
                    Пользователи не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ModalSurface
        open={Boolean(activeUser)}
        onClose={closeModal}
        title="Изменить тариф"
      >
        {activeUser ? (
          <div className="space-y-4">
            <div className="text-sm text-text-sec">
              Пользователь: <span className="font-medium text-text-main">{activeUser.displayName || "—"}</span>
            </div>
            <Select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
            >
              <option value="" disabled>
                Выберите тариф
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.scope === "MASTER" ? "Мастер" : "Студия"})
                </option>
              ))}
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeModal} disabled={savingPlan}>
                Отмена
              </Button>
              <Button onClick={savePlan} disabled={savingPlan || !selectedPlanId}>
                {savingPlan ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>
    </section>
  );
}
