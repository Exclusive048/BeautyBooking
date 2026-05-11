"use client";

import { motion } from "framer-motion";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  services: ProviderServiceDto[];
  selectedServiceIds: string[];
  onAdd: (service: ProviderServiceDto) => void;
};

export function ServicesMenu({ services, selectedServiceIds, onAdd }: Props) {
  return (
    <section className="lux-card rounded-[28px] p-5">
      <h2 className="text-lg font-semibold text-text-main">{UI_TEXT.publicProfile.services.title}</h2>
      <motion.div
        className="mt-4 space-y-3"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
      >
        {services.map((service) => {
          const isSelected = selectedServiceIds.includes(service.id);
          return (
            <motion.article
              key={service.id}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
              }}
              className="group rounded-2xl border border-border-subtle bg-bg-input/70 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-bg-card hover:shadow-card"
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
            </motion.article>
          );
        })}
      </motion.div>
    </section>
  );
}
