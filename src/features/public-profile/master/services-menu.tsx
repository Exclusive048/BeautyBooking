"use client";

import { useMemo } from "react";
import { m } from "framer-motion";
import { HOVER_LIFT } from "@/components/ui/motion-classes";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { DISTANCE, MOTION, STAGGER } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { groupServicesByCategory } from "@/lib/providers/group-services";

type Props = {
  services: ProviderServiceDto[];
  selectedServiceIds: string[];
  onAdd: (service: ProviderServiceDto) => void;
};

export function ServicesMenu({ services, selectedServiceIds, onAdd }: Props) {
  // FIX-R2-04-C: group the services menu by attached category (presentational).
  const groups = useMemo(() => groupServicesByCategory(services), [services]);
  return (
    <section className="lux-card rounded-[28px] p-5">
      <h2 className="text-lg font-semibold text-text-main">{UI_TEXT.publicProfile.services.title}</h2>
      {groups.length === 0 ? (
        // FIX-D1 (F7): то же оформление, что у «Портфолио» — заголовок без
        // содержимого читается как сломанная страница независимо от причины.
        <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/70 p-4 text-sm text-text-sec">
          {UI_TEXT.publicProfile.services.empty}
        </div>
      ) : (
      <div className="mt-4 space-y-6">
        {groups.map((group) => (
          <div key={group.categoryName ?? "__uncat"} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-sm font-semibold text-text-main">
                {group.categoryName ?? UI_TEXT.publicProfile.services.categoryOther}
              </h3>
              <span className="rounded-full bg-bg-input px-2 py-0.5 font-mono text-3xs text-text-sec">
                {group.services.length}
              </span>
            </div>
            <m.div
              className="space-y-3"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: STAGGER } } }}
            >
              {group.services.map((service) => {
                const isSelected = selectedServiceIds.includes(service.id);
                return (
                  <m.article
                    key={service.id}
                    variants={{
                      hidden: { opacity: 0, y: DISTANCE.rise },
                      visible: { opacity: 1, y: 0, transition: MOTION.base },
                    }}
                    className={`group rounded-2xl border border-border-subtle bg-bg-input/70 p-4 hover:bg-bg-card hover:shadow-card ${HOVER_LIFT}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-main">{service.name}</div>
                        <div className="mt-1 text-sm text-text-sec">
                          {service.price > 0
                            ? UI_FMT.priceDurationLabel(service.price, service.durationMin)
                            : UI_TEXT.publicProfile.services.priceOnRequest}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onAdd(service)}
                        disabled={isSelected}
                        className="flex items-center gap-1.5 rounded-full border-border-subtle bg-bg-card px-3 py-1.5 hover:border-primary/50 hover:shadow-card"
                      >
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-input text-xs" aria-hidden="true">
                          +
                        </span>
                        <span>{UI_TEXT.publicProfile.services.add}</span>
                      </Button>
                    </div>
                  </m.article>
                );
              })}
            </m.div>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
