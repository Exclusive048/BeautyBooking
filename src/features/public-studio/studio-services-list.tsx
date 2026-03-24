"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { studioBookingUrl } from "@/lib/public-urls";

type Props = {
  studio: { id: string; publicUsername: string | null };
  categories: string[];
  services: ProviderServiceDto[];
};

type ServiceGroup = {
  title: string;
  services: ProviderServiceDto[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function buildGroups(categories: string[], services: ProviderServiceDto[]): ServiceGroup[] {
  if (services.length === 0) return [];
  if (categories.length === 0) {
    return [{ title: UI_TEXT.publicStudio.allServices, services }];
  }

  const remaining = [...services];
  const groups: ServiceGroup[] = [];

  for (const category of categories) {
    const key = normalize(category);
    const inGroup = remaining.filter((service) => normalize(service.name).includes(key));
    if (inGroup.length > 0) {
      groups.push({ title: category, services: inGroup });
      for (const item of inGroup) {
        const index = remaining.findIndex((service) => service.id === item.id);
        if (index >= 0) remaining.splice(index, 1);
      }
    }
  }

  if (remaining.length > 0) {
    groups.push({ title: UI_TEXT.publicStudio.allServices, services: remaining });
  }

  return groups.length > 0 ? groups : [{ title: UI_TEXT.publicStudio.allServices, services }];
}

export function StudioServicesList({ studio, categories, services }: Props) {
  const groups = useMemo(() => buildGroups(categories, services), [categories, services]);
  const [activeGroup, setActiveGroup] = useState(groups[0]?.title ?? UI_TEXT.publicStudio.allServices);

  const activeServices = groups.find((group) => group.title === activeGroup)?.services ?? [];

  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 text-sm text-text-sec">
        {UI_TEXT.publicStudio.noServices}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 md:p-6">
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => {
          const active = group.title === activeGroup;
          return (
            <Button
              key={group.title}
              type="button"
              onClick={() => setActiveGroup(group.title)}
              size="sm"
              variant={active ? "primary" : "secondary"}
              className="rounded-full px-3 text-xs"
            >
              {group.title}
            </Button>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        {activeServices.map((service) => (
          <article key={service.id} className="rounded-xl border border-border-subtle bg-bg-input/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text-main">{service.name}</div>
                <div className="mt-1 text-xs text-text-sec">
                  {service.price > 0
                    ? UI_FMT.priceDurationLabel(service.price, service.durationMin)
                    : UI_TEXT.publicStudio.servicePriceOnRequest}
                </div>
              </div>
              <Button asChild size="sm" className="h-8 rounded-lg px-2.5 text-xs">
                <Link
                  href={studioBookingUrl(studio, { serviceId: service.id }, "studio-services")}
                  aria-label={`${UI_TEXT.publicStudio.goToBooking}: ${service.name}`}
                >
                  {UI_TEXT.publicStudio.addService}
                </Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
