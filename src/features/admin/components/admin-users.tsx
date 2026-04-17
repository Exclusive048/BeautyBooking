"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.admin.users;

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
  summary: { total: number; clients: number; masters: number; studios: number };
  nextCursor: string | null;
};

type BillingResponse = { plans: PlanInfo[] };

function formatDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
}

function typeLabel(type: UserItem["type"]) {
  if (type === "master") return t.type.master;
  if (type === "studio") return t.type.studio;
  return t.type.client;
}

export function AdminUsers() {
  const viewerTimeZone = useViewerTimeZoneContext();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [users, setUsers] = useState<UserItem[]>([]);
  const [summary, setSummary] = useState<UsersResponse["summary"] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeUser, setActiveUser] = useState<UserItem | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  const buildUrl = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (search.trim()) params.set("search", search.trim());
    if (cursor) params.set("cursor", cursor);
    return `/api/admin/users?${params.toString()}`;
  };

  const loadUsers = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const url = reset ? buildUrl() : buildUrl(nextCursor);
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<UsersResponse> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.errors.loadUsers);
        }
        if (reset) {
          setUsers(json.data.users);
          setSummary(json.data.summary);
        } else {
          setUsers((prev) => [...prev, ...json.data.users]);
        }
        setNextCursor(json.data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.errors.loadUsers);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, search, nextCursor]
  );

  useEffect(() => {
    void loadUsers(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  useEffect(() => {
    fetch("/api/admin/billing", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: ApiResponse<BillingResponse>) => {
        if (json.ok) setPlans(json.data.plans);
      })
      .catch(() => null);
  }, []);

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
        throw new Error(json && !json.ok ? json.error.message : t.errors.updatePlan);
      }
      await loadUsers(true);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.updatePlan);
    } finally {
      setSavingPlan(false);
    }
  };

  const tabs = useMemo(
    () => [
      { id: "all", label: t.tabs.all, badge: summary?.total ?? 0 },
      { id: "masters", label: t.tabs.masters, badge: summary?.masters ?? 0 },
      { id: "studios", label: t.tabs.studios, badge: summary?.studios ?? 0 },
      { id: "clients", label: t.tabs.clients, badge: summary?.clients ?? 0 },
    ],
    [summary]
  );

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
      </header>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs items={tabs} value={filter} onChange={setFilter} />
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec" />
          <Input
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                  <th className="px-4 py-3 text-left">{t.table.name}</th>
                  <th className="px-4 py-3 text-left">{t.table.phone}</th>
                  <th className="px-4 py-3 text-left">{t.table.email}</th>
                  <th className="px-4 py-3 text-left">{t.table.type}</th>
                  <th className="px-4 py-3 text-left">{t.table.createdAt}</th>
                  <th className="px-4 py-3 text-right">{t.table.plan}</th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? (
                  users.map((user, index) => (
                    <tr key={user.id} className={index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}>
                      <td className="px-4 py-3 text-sm text-text-main">
                        {user.displayName || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-text-sec">
                        {user.phone || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-sec">{user.email || "—"}</td>
                      <td className="px-4 py-3 text-sm text-text-sec">{typeLabel(user.type)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-text-sec">
                        {formatDate(user.createdAt, viewerTimeZone)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="flex flex-col items-end gap-1 text-xs text-text-sec">
                            {user.subscriptions.length > 0 ? (
                              user.subscriptions.map((sub) => (
                                <span key={`${user.id}:${sub.scope}`}>
                                  {sub.scope}: {sub.plan.name}
                                </span>
                              ))
                            ) : (
                              <span>FREE</span>
                            )}
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => openModal(user)}>
                            {t.changePlan}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-text-sec">
                      {t.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {nextCursor ? (
            <div className="border-t border-border-subtle/60 px-4 py-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadUsers(false)}
                disabled={loadingMore}
              >
                {loadingMore ? t.loadingMore : t.loadMore}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <ModalSurface open={Boolean(activeUser)} onClose={closeModal} title={t.modalTitle}>
        {activeUser ? (
          <div className="space-y-4">
            <div className="text-sm text-text-sec">
              {t.userLabel}:{" "}
              <span className="font-medium text-text-main">{activeUser.displayName || "—"}</span>
            </div>
            <Select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
            >
              <option value="" disabled>
                {t.choosePlan}
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.scope === "MASTER" ? t.type.master : t.type.studio})
                </option>
              ))}
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeModal} disabled={savingPlan}>
                {UI_TEXT.actions.cancel}
              </Button>
              <Button onClick={() => void savePlan()} disabled={savingPlan || !selectedPlanId}>
                {savingPlan ? t.saving : t.save}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>
    </section>
  );
}
