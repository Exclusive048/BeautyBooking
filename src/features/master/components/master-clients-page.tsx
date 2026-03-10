"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { UI_FMT } from "@/lib/ui/fmt";
import { CLIENT_TAGS } from "@/lib/crm/tags";
import { ClientCardDrawer } from "@/features/crm/components/client-card-drawer";
import { ModalSurface } from "@/components/ui/modal-surface";

type ClientCardSummary = {
  id: string;
  tags: string[];
  hasNotes: boolean;
  photosCount: number;
};

type ClientItem = {
  key: string;
  displayName: string;
  phone: string;
  lastBookingAt: string;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  lastServiceName: string;
  visitsCount: number;
  totalAmount: number;
  card: ClientCardSummary | null;
};

type ClientsData = {
  clients: ClientItem[];
};

type SelectedClient = {
  key: string;
  name: string;
  phone: string;
};

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function formatDaysAgo(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "Сегодня";
  const mod10 = value % 10;
  const mod100 = value % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? "день"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "дня"
        : "дней";
  return `${value} ${suffix} назад`;
}

export function MasterClientsPage() {
  const viewerTimeZone = useViewerTimeZoneContext();
  const searchParams = useSearchParams();
  const rawSort = searchParams.get("sort");
  const sort = rawSort === "visits" || rawSort === "alpha" || rawSort === "recent" ? rawSort : "recent";
  const plan = usePlanFeatures("MASTER");
  const [data, setData] = useState<ClientsData>({ clients: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedClient | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const tagMap = useMemo(() => new Map(CLIENT_TAGS.map((tag) => [tag.id, tag])), []);

  const canOpenCards = plan.tier ? plan.tier !== "FREE" : false;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (sort) params.set("sort", sort);
        const res = await fetch(`/api/master/clients?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<ClientsData> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить клиентов");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [reloadTick, sort]);

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка клиентов...</div>;
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {data.clients.length === 0 ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Пока нет клиентов. Список формируется из записей.</div>
      ) : (
        <div className="lux-card overflow-hidden rounded-[24px]">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-bg-input/55 text-xs font-semibold text-text-sec">
                <th className="px-4 py-3 text-left">Клиент</th>
                <th className="px-4 py-3 text-left">Телефон</th>
                <th className="px-4 py-3 text-left">Последний визит</th>
                <th className="px-4 py-3 text-left">Услуга</th>
                <th className="px-4 py-3 text-left">Теги</th>
                <th className="px-4 py-3 text-left">Посещения</th>
                <th className="px-4 py-3 text-left">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client, index) => {
                const tagIds = client.card?.tags ?? [];
                const visibleTags = tagIds.slice(0, 3);
                const extraTags = Math.max(0, tagIds.length - visibleTags.length);
                const lastVisitIso = client.lastVisitAt ?? client.lastBookingAt;
                return (
                  <tr
                    key={client.key}
                    className={`cursor-pointer ${index % 2 === 0 ? "bg-bg-card" : "bg-bg-input/30"}`}
                    onClick={() => {
                      if (plan.loading) return;
                      if (!canOpenCards) {
                        setShowUpgrade(true);
                        return;
                      }
                      setSelected({ key: client.key, name: client.displayName, phone: client.phone });
                    }}
                  >
                    <td className="px-4 py-3 text-sm text-text-main">{client.displayName}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">{client.phone}</td>
                    <td className="px-4 py-3 text-sm text-text-sec">
                      <div>{UI_FMT.dateTimeShort(lastVisitIso, { timeZone: viewerTimeZone })}</div>
                      <div className="mt-1 text-xs text-text-sec">{formatDaysAgo(client.daysSinceLastVisit)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-sec">{client.lastServiceName}</td>
                    <td className="px-4 py-3 text-xs text-text-sec">
                      <div className="flex flex-wrap gap-1">
                        {visibleTags.map((tagId) => {
                          const tag = tagMap.get(tagId);
                          if (!tag) return null;
                          return (
                            <span key={tagId} className="rounded-full border border-border-subtle px-2 py-0.5">
                              {tag.emoji} {tag.label}
                            </span>
                          );
                        })}
                        {extraTags > 0 ? (
                          <span className="rounded-full border border-border-subtle px-2 py-0.5">+{extraTags}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-main">{client.visitsCount}</td>
                    <td className="px-4 py-3 text-sm text-text-main">{formatMoney(client.totalAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <ClientCardDrawer
          scope="MASTER"
          clientKey={selected.key}
          clientName={selected.name}
          clientPhone={selected.phone}
          onClose={() => setSelected(null)}
          onUpdated={() => setReloadTick((prev) => prev + 1)}
        />
      ) : null}

      <ModalSurface open={showUpgrade} onClose={() => setShowUpgrade(false)} title="Доступно на тарифе PRO">
        <p className="text-sm text-text-sec">
          Заметки, теги, фото работ и история визитов доступны с тарифа PRO.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <a
            href="/cabinet/billing?scope=MASTER"
            className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm text-[rgb(var(--accent-foreground))]"
          >
            Перейти к тарифам
          </a>
        </div>
      </ModalSurface>
    </section>
  );
}
