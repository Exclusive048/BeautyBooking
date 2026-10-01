"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioServiceListItem } from "../lib/types";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.studioCabinet.servicesV2.list;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

export function ServiceListItem({
  service,
  isSelected,
}: {
  service: StudioServiceListItem;
  isSelected: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const select = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("service", service.id);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <Button variant="wrapper"
      onClick={select}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
        isSelected
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : "border-border-subtle bg-bg-card hover:bg-bg-input/30",
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-text-main">
            {service.name}
          </span>
          {!service.isActive ? (
            <span className="rounded-full border border-border-subtle bg-bg-input px-1.5 py-0.5 font-mono text-3xs uppercase tracking-wide text-text-sec">
              {T.pausedBadge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-2xs text-text-sec">
          {T.bookingsTemplate.replace("{count}", String(service.bookings30d))}
        </p>
        <div className="mt-2 flex items-center gap-3 text-2xs text-text-sec">
          <span>
            {T.durationTemplate.replace("{min}", String(service.durationMin))}
          </span>
          <span aria-hidden>·</span>
          <span className="font-mono tabular-nums">
            {UI_FMT.priceLabel(service.priceKopeks)}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex -space-x-1.5">
          {service.masters.slice(0, 3).map((master) => (
            <span
              key={master.id}
              className="inline-block h-6 w-6 overflow-hidden rounded-full ring-2 ring-bg-card"
              title={master.displayName}
            >
              {master.avatarUrl ? (
                <ResilientImage
                  src={master.avatarUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-6 w-6 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec"
                >
                  {initials(master.displayName)}
                </span>
              )}
            </span>
          ))}
        </div>
        {service.masters.length === 0 ? (
          <span className="rounded-full border border-warning-border bg-warning-surface px-1.5 py-0.5 font-mono text-3xs uppercase tracking-wide text-warning-text">
            {T.noMasterBadge}
          </span>
        ) : null}
      </div>
    </Button>
  );
}
