"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { studioBookingUrl } from "@/lib/public-urls";
import { groupServicesByCategory } from "@/lib/providers/group-services";

// Client-only render key for the uncategorized bucket (never a DB id — rule 12).
const UNCATEGORIZED_CHIP_KEY = "__uncat__";

type Props = {
  studio: { id: string; publicUsername: string | null };
  services: ProviderServiceDto[];
  /** FIX-STUDIO-02 (owner parity): suppress per-service booking CTAs for the owner. */
  hideBooking?: boolean;
};

/**
 * FIX-BATCH-B: the public studio profile services list now mirrors the booking
 * wizard's R2-04-C treatment — services grouped into category sections (headers
 * + count) with per-category filter-chips ("Все" + each category). Reuses the
 * SAME shared `groupServicesByCategory` helper as the wizard + master profile
 * (one grouping source; groups by `categoryName` LABEL, never a raw id — rule
 * 12). The former homegrown name-substring grouping (`buildGroups`) is retired.
 * Presentational only — each service still deep-links into the booking flow.
 */
export function StudioServicesList({ studio, services, hideBooking }: Props) {
  // Same grouping as the wizard: category order asc, uncategorized bucket last,
  // empty groups omitted, input order preserved within a group.
  const groups = useMemo(() => groupServicesByCategory(services), [services]);

  // Filter-chips derived from the groups (labels, not ids — rule 12).
  const chips = useMemo(
    () =>
      groups.map((group) => ({
        key: group.categoryName ?? UNCATEGORIZED_CHIP_KEY,
        label: group.categoryName ?? UI_TEXT.publicStudio.categoryOther,
      })),
    [groups],
  );

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const activeExists = activeCat !== null && chips.some((chip) => chip.key === activeCat);
  const visibleGroups = activeExists
    ? groups.filter((group) => (group.categoryName ?? UNCATEGORIZED_CHIP_KEY) === activeCat)
    : groups;

  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 text-sm text-text-sec">
        {UI_TEXT.publicStudio.noServices}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 md:p-6">
      {/* Category filter-chips (horizontal-scroll on mobile) — mirrors the wizard. */}
      {chips.length > 1 ? (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
          role="group"
          aria-label={UI_TEXT.publicStudio.servicesTitle}
        >
          <Button
            type="button"
            onClick={() => setActiveCat(null)}
            size="sm"
            variant={activeCat === null ? "primary" : "secondary"}
            className="shrink-0 rounded-full px-3 text-xs"
            aria-pressed={activeCat === null}
          >
            {UI_TEXT.publicStudio.categoryAll}
          </Button>
          {chips.map((chip) => (
            <Button
              key={chip.key}
              type="button"
              onClick={() => setActiveCat(chip.key)}
              size="sm"
              variant={activeCat === chip.key ? "primary" : "secondary"}
              className="shrink-0 rounded-full px-3 text-xs"
              aria-pressed={activeCat === chip.key}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className={`space-y-6 ${chips.length > 1 ? "mt-4" : ""}`}>
        {visibleGroups.map((group) => (
          <div key={group.categoryName ?? "__uncat"} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-sm font-semibold text-text-main">
                {group.categoryName ?? UI_TEXT.publicStudio.categoryOther}
              </h3>
              <span className="rounded-full bg-bg-input px-2 py-0.5 font-mono text-3xs text-text-sec">
                {group.services.length}
              </span>
            </div>
            <div className="space-y-3">
              {group.services.map((service) => (
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
                    {hideBooking ? null : (
                      <Button asChild size="sm" className="h-8 rounded-lg px-2.5 text-xs">
                        <Link
                          href={studioBookingUrl(studio, { serviceId: service.id }, "studio-services") ?? "#"}
                          aria-label={`${UI_TEXT.publicStudio.goToBooking}: ${service.name}`}
                        >
                          {UI_TEXT.publicStudio.addService}
                        </Link>
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
