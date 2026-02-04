"use client";

import type { ProviderServiceDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  services: ProviderServiceDto[];
  selectedServiceIds: string[];
  onAdd: (service: ProviderServiceDto) => void;
};

export function ServicesMenu({ services, selectedServiceIds, onAdd }: Props) {
  return (
    <section className="rounded-2xl bg-neutral-900 p-5 text-white shadow-lg">
      <h2 className="text-lg font-semibold">{UI_TEXT.publicProfile.services.title}</h2>
      <div className="mt-4 space-y-3">
        {services.map((service) => {
          const isSelected = selectedServiceIds.includes(service.id);
          return (
            <article key={service.id} className="rounded-xl bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{service.name}</div>
                  <div className="mt-1 text-sm text-white/75">
                    {service.price > 0
                      ? `${new Intl.NumberFormat("ru-RU").format(service.price)} ₽ • ${UI_FMT.durationLabel(service.durationMin)}`
                      : UI_TEXT.publicProfile.services.priceOnRequest}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(service)}
                  disabled={isSelected}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {UI_TEXT.publicProfile.services.add}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

