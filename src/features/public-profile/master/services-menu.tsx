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
  /**
   * BOOKING-WIDGET-DIALOG: «Записаться» открывает окно записи с этой услугой.
   * Нет — кнопок нет (страницу смотрит её владелец).
   */
  onBook?: (service: ProviderServiceDto) => void;
};

export function ServicesMenu({ services, onBook }: Props) {
  // FIX-R2-04-C: group the services menu by attached category (presentational).
  const groups = useMemo(() => groupServicesByCategory(services), [services]);
  return (
    <section className="lux-card rounded-3xl p-5">
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
              <h3 className="min-w-0 break-words font-display text-sm font-semibold text-text-main">
                {group.categoryName ?? UI_TEXT.publicProfile.services.categoryOther}
              </h3>
              <span className="shrink-0 rounded-full bg-bg-input px-2 py-0.5 font-mono text-3xs text-text-sec">
                {group.services.length}
              </span>
            </div>
            <m.div
              className="space-y-3"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: STAGGER } } }}
            >
              {group.services.map((service) => (
                <m.article
                  key={service.id}
                  variants={{
                    hidden: { opacity: 0, y: DISTANCE.rise },
                    visible: { opacity: 1, y: 0, transition: MOTION.base },
                  }}
                  className={`group rounded-2xl border border-border-subtle bg-bg-input/70 p-4 hover:bg-bg-card hover:shadow-card ${HOVER_LIFT}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Длинное название переносится внутри колонки, кнопка не сжимается. */}
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-medium text-text-main">{service.name}</div>
                      <div className="mt-1 text-sm text-text-sec">
                        {service.price > 0
                          ? UI_FMT.priceDurationLabel(service.price, service.durationMin)
                          : UI_TEXT.publicProfile.services.priceOnRequest}
                      </div>
                    </div>
                    {onBook ? (
                      <Button
                        size="sm"
                        onClick={() => onBook(service)}
                        aria-label={UI_TEXT.publicProfile.services.bookAria(service.name)}
                        className="h-9 shrink-0 rounded-lg px-3 text-xs"
                      >
                        {UI_TEXT.publicProfile.services.book}
                      </Button>
                    ) : null}
                  </div>
                </m.article>
              ))}
            </m.div>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
