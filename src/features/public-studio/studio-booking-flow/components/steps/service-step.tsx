"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { StudioMaster } from "@/features/booking/lib/studio-booking";
import { groupServicesByCategory } from "@/lib/providers/group-services";

type ServiceItem = ProviderProfileDto["services"][number];

type Props = {
  services: ServiceItem[];
  masters: StudioMaster[];
  selectedServiceId: string;
  prefilledMaster: StudioMaster | null;
  onPick: (serviceId: string) => void;
};

export function ServiceStep({ services, masters, selectedServiceId, prefilledMaster, onPick }: Props) {
  const [query, setQuery] = useState("");
  const baseServices = useMemo(() => {
    if (!prefilledMaster) return services;
    // Scenario B already came in with prefilledMaster; service list is studio-scope.
    // FOUNDATION-A's per-master availability check ensures only services this master
    // can do are bookable at the next step. We could pre-filter here too but trust
    // the server's `SERVICE_INVALID` guard for correctness.
    return services;
  }, [services, prefilledMaster]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseServices;
    return baseServices.filter((service) => service.name.toLowerCase().includes(q));
  }, [baseServices, query]);

  // FIX-R2-04-C: group the (search-filtered) services by attached category.
  // Presentational only — selection mechanic (onPick) unchanged.
  const groups = useMemo(() => groupServicesByCategory(filtered), [filtered]);

  const heading = prefilledMaster
    ? UI_TEXT.bookingWidget.serviceStep.titleMaster.replace("{master}", prefilledMaster.name.split(" ")[0] ?? "")
    : UI_TEXT.bookingWidget.serviceStep.titleStudio;
  const subtitle = prefilledMaster
    ? UI_TEXT.bookingWidget.serviceStep.subtitleMaster
    : UI_TEXT.bookingWidget.serviceStep.subtitleStudio.replace("{count}", String(baseServices.length));

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-text sm:text-xl">{heading}</h2>
          <p className="text-xs text-text-muted sm:text-sm">{subtitle}</p>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={UI_TEXT.bookingWidget.serviceStep.searchPlaceholder}
          className="pl-9"
          aria-label={UI_TEXT.bookingWidget.serviceStep.searchPlaceholder}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-bg-muted/40 p-8 text-center text-sm text-text-muted">
          {query ? UI_TEXT.bookingWidget.serviceStep.searchEmpty : UI_TEXT.bookingWidget.serviceStep.noServices}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.categoryName ?? "__uncat"} className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <h3 className="font-display text-sm font-semibold text-text">
                  {group.categoryName ?? UI_TEXT.bookingWidget.serviceStep.categoryOther}
                </h3>
                <span className="rounded-full bg-bg-muted px-2 py-0.5 font-mono text-[10px] text-text-muted">
                  {group.services.length}
                </span>
              </div>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {group.services.map((service) => {
                  const isSelected = service.id === selectedServiceId;
                  return (
                    <li key={service.id}>
                      <Button
                        type="button"
                        variant={isSelected ? "primary" : "secondary"}
                        size="none"
                        onClick={() => onPick(service.id)}
                        className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border-subtle hover:border-primary/60"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{service.name}</div>
                            <div className="mt-1 text-xs opacity-80">
                              {service.durationMin
                                ? UI_TEXT.bookingWidget.serviceStep.duration.replace(
                                    "{min}",
                                    String(service.durationMin),
                                  )
                                : ""}
                              {service.durationMin && service.price > 0 ? " · " : ""}
                              {service.price > 0
                                ? UI_FMT.priceLabel(service.price)
                                : UI_TEXT.bookingWidget.serviceStep.priceOnRequest}
                            </div>
                          </div>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                            {isSelected ? "✓" : UI_TEXT.bookingWidget.serviceStep.pick}
                          </span>
                        </div>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {masters.length > 0 && !prefilledMaster ? (
        <p className="text-[11px] text-text-muted">
          {UI_TEXT.bookingWidget.hero.mastersCount.replace("{count}", String(masters.length))}
        </p>
      ) : null}
    </section>
  );
}
