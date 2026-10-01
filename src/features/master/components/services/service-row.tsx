"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type {
  ServiceCategoryOption,
  ServiceItemView,
} from "@/lib/master/services-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { ServiceModal } from "./modals/service-modal";
import { ReorderControls } from "./reorder-controls";
import { RowMenu } from "./row-menu";
import { formatDuration } from "./lib/format";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";

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
        <Button variant="wrapper"
          onClick={() => setEditOpen(true)}
          aria-label={T.editAriaLabel}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-sm text-text-main">{service.name}</span>
          {!service.isEnabled ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {T.disabledBadge}
            </span>
          ) : null}
        </Button>
        <span className="shrink-0 font-mono text-[11px] text-text-sec">
          {formatDuration(service.durationMin)}
        </span>
        <span className="w-20 shrink-0 text-right font-mono text-sm font-medium text-text-main">
          {UI_FMT.priceLabelOrDash(service.price)}
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
