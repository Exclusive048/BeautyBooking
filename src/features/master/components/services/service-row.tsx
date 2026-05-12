"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type {
  ServiceCategoryOption,
  ServiceItemView,
} from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ServiceModal } from "./modals/service-modal";
import { ReorderControls } from "./reorder-controls";
import { RowMenu } from "./row-menu";
import { formatDuration, formatRubles } from "./lib/format";

const T = UI_TEXT.cabinetMaster.servicesPage.row;

type Props = {
  service: ServiceItemView;
  categories: ServiceCategoryOption[];
  onlinePaymentsAvailable: boolean;
};

export function ServiceRow({ service, categories, onlinePaymentsAvailable }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const isFirst = service.globalIndex === 0;
  const isLast = service.globalIndex === service.globalCount - 1;

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-card px-3 py-2.5 transition-colors hover:border-primary/30",
          !service.isEnabled && "opacity-60"
        )}
      >
        <ReorderControls
          itemId={service.id}
          endpoint="/api/master/services/reorder"
          isFirst={isFirst}
          isLast={isLast}
        />
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label={T.editAriaLabel}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-sm text-text-main">{service.name}</span>
          {!service.isEnabled ? (
            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {T.disabledBadge}
            </span>
          ) : null}
        </button>
        <span className="shrink-0 font-mono text-[11px] text-text-sec">
          {formatDuration(service.durationMin)}
        </span>
        <span className="w-20 shrink-0 text-right font-mono text-sm font-medium text-text-main">
          {formatRubles(service.price)}
        </span>
        <RowMenu
          itemId={service.id}
          itemType="service"
          isEnabled={service.isEnabled}
          onEditClick={() => setEditOpen(true)}
        />
      </div>

      {editOpen ? (
        <ServiceModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          service={service}
          categories={categories}
          onlinePaymentsAvailable={onlinePaymentsAvailable}
        />
      ) : null}
    </>
  );
}
