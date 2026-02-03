"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/ui/text";

type PortfolioItemPreview = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  primaryServiceTitle: string | null;
  masterName: string;
};

type PortfolioDetail = PortfolioItemPreview & {
  serviceOptions: Array<{
    serviceId: string;
    title: string;
    durationMin: number;
    price: number;
  }>;
};

type Props = {
  items: PortfolioItemPreview[];
};

function formatPrice(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

export function PortfolioStrip({ items }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PortfolioDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  function closeViewer() {
    setSelectedId(null);
    setSelectedItem(null);
    setError(null);
  }

  const selectedPreview = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    async function loadDetail() {
      const res = await fetch(`/api/portfolio/${selectedId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { item: PortfolioDetail } }
        | { ok: false; error: { message: string } }
        | null;
      if (!cancelled && res.ok && json && json.ok) {
        setSelectedItem(json.data.item);
        return;
      }
      if (!cancelled) {
        setSelectedItem(null);
        setError(UI_TEXT.publicProfile.portfolio.viewError);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <section className="rounded-2xl bg-neutral-900 p-5 text-white shadow-lg">
      <h2 className="text-lg font-semibold">{UI_TEXT.publicProfile.portfolio.title}</h2>
      {items.length === 0 ? (
        <div className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-white/75">{UI_TEXT.publicProfile.portfolio.empty}</div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setError(null);
                setSelectedItem(null);
                setSelectedId(item.id);
              }}
              className="group overflow-hidden rounded-xl bg-white/5 text-left"
            >
              <div className="aspect-square overflow-hidden">
                <img
                  src={item.mediaUrl}
                  alt={item.caption ?? item.primaryServiceTitle ?? UI_TEXT.publicProfile.portfolio.untitledWork}
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-2 text-xs text-white/80">
                {item.primaryServiceTitle ?? item.caption ?? item.masterName}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedId ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={closeViewer}
            aria-label={UI_TEXT.common.cancel}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl rounded-2xl bg-white p-4 text-neutral-900 shadow-2xl">
              {error ? <div className="text-sm text-red-700">{error}</div> : null}
              {selectedItem ? (
                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <img
                    src={selectedItem.mediaUrl}
                    alt={selectedItem.caption ?? selectedItem.primaryServiceTitle ?? UI_TEXT.publicProfile.portfolio.untitledWork}
                    className="max-h-[72vh] w-full rounded-xl object-contain"
                  />
                  <div>
                    <div className="text-lg font-semibold">{selectedItem.masterName}</div>
                    <div className="mt-2 text-sm text-neutral-600">{selectedItem.caption ?? selectedPreview?.caption ?? ""}</div>
                    <div className="mt-4 space-y-2 text-sm">
                      {selectedItem.serviceOptions.map((service) => (
                        <div key={service.serviceId}>
                          • {service.title} — {formatPrice(service.price)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

