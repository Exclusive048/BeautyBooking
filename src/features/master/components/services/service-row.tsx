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
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { Badge } from "@/components/ui/badge";

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
        {/* На телефоне длительность — строкой под названием, а само название
            переносится на две строки (и на ПК): в одну строку со стрелками, ценой и
            меню оно сжималось до «Педи…». */}
        <Button variant="wrapper"
          onClick={() => setEditOpen(true)}
          aria-label={T.editAriaLabel}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left sm:flex-row sm:items-center sm:gap-2"
        >
          <span className="flex min-w-0 max-w-full items-center gap-2">
            <span className="line-clamp-2 break-words text-sm text-text-main">
              {service.name}
            </span>
            {!service.isEnabled ? (
              <Badge size="xs" variant="muted">
                {T.disabledBadge}
              </Badge>
            ) : null}
          </span>
          <span className="font-mono text-2xs text-text-sec sm:hidden">
            {UI_FMT.durationLabelOrDash(service.durationMin)}
          </span>
        </Button>
        <span className="hidden shrink-0 font-mono text-2xs text-text-sec sm:inline">
          {UI_FMT.durationLabelOrDash(service.durationMin)}
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
