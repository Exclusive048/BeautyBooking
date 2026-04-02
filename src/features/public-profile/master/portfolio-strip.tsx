"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type PortfolioItemPreview = {
  id: string;
  mediaUrl: string;
  visualSearchReady: boolean;
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
    <section className="lux-card rounded-[28px] p-5">
      <h2 className="text-lg font-semibold text-text-main">{UI_TEXT.publicProfile.portfolio.title}</h2>
      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/70 p-4 text-sm text-text-sec">
          {UI_TEXT.publicProfile.portfolio.empty}
        </div>
      ) : (
        <motion.div
          className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
        >
          {items.map((item) => (
            <motion.div
              key={item.id}
              variants={{
                hidden: { opacity: 0, scale: 0.95 },
                visible: { opacity: 1, scale: 1, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
              }}
            >
              <Button
                variant="wrapper"
                onClick={() => {
                  setError(null);
                  setSelectedItem(null);
                  setSelectedId(item.id);
                }}
                className="group w-full overflow-hidden rounded-2xl border border-border-subtle bg-bg-input/60 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="relative aspect-square overflow-hidden">
                  {item.visualSearchReady ? (
                    <div className="absolute left-2 top-2 z-10 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
                      {UI_TEXT.publicProfile.portfolio.indexedBadge}
                    </div>
                  ) : null}
                  <Image
                    src={item.mediaUrl}
                    alt={item.caption ?? item.primaryServiceTitle ?? UI_TEXT.publicProfile.portfolio.untitledWork}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/25 group-hover:opacity-100">
                    <ZoomIn className="h-6 w-6 text-white drop-shadow" aria-hidden />
                  </div>
                </div>
                <div className="p-2 text-xs text-text-sec">
                  {item.primaryServiceTitle ?? item.caption ?? item.masterName}
                </div>
              </Button>
            </motion.div>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {selectedId ? (
          <motion.div
            key="lightbox"
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              variant="wrapper"
              className="absolute inset-0 bg-black/65"
              onClick={closeViewer}
              aria-label={UI_TEXT.publicProfile.portfolio.close}
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <motion.div
                className="relative w-full max-w-4xl rounded-[26px] border border-border-subtle bg-bg-card p-4 shadow-hover"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
              >
                <button
                  type="button"
                  onClick={closeViewer}
                  aria-label={UI_TEXT.publicProfile.portfolio.close}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-bg-input transition hover:bg-bg-card"
                >
                  <X className="h-4 w-4 text-text-sec" aria-hidden />
                </button>

                {error ? <div className="py-6 text-center text-sm text-rose-500">{error}</div> : null}

                {!error && !selectedItem ? (
                  <div className="flex min-h-[240px] items-center justify-center text-sm text-text-sec">
                    {UI_TEXT.publicProfile.portfolio.loading}
                  </div>
                ) : null}

                {selectedItem ? (
                  <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="relative aspect-[3/4] max-h-[72vh] w-full">
                      <Image
                        src={selectedItem.mediaUrl}
                        alt={
                          selectedItem.caption ??
                          selectedItem.primaryServiceTitle ??
                          UI_TEXT.publicProfile.portfolio.untitledWork
                        }
                        fill
                        sizes="(max-width: 1024px) 90vw, 50vw"
                        className="rounded-2xl object-contain"
                      />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-text-main">{selectedItem.masterName}</div>
                      <div className="mt-2 text-sm text-text-sec">
                        {selectedItem.caption ?? selectedPreview?.caption ?? ""}
                      </div>
                      {selectedItem.serviceOptions.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {selectedItem.serviceOptions.map((service) => (
                            <div key={service.serviceId} className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2">
                              <span className="text-sm text-text-main">{service.title}</span>
                              <span className="text-sm font-medium text-text-sec">{UI_FMT.priceLabel(service.price)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
