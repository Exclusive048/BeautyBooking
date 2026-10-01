"use client";

import { AlertTriangle, Package } from "lucide-react";
import { useState } from "react";
import { DiscountType } from "@/lib/prisma-enums";
import { cn } from "@/lib/cn";
import type {
  MasterServicesViewData,
  ServicePackageView,
} from "@/lib/master/services-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { BundleModal } from "./modals/bundle-modal";
import { ReorderControls } from "./reorder-controls";
import { RowMenu } from "./row-menu";
import { formatDuration } from "./lib/format";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { Badge } from "@/components/ui/badge";

const ROW = UI_TEXT.cabinetMaster.servicesPage.row;
const T = UI_TEXT.cabinetMaster.servicesPage.bundleRow;

type Props = {
  bundle: ServicePackageView;
  allServices: MasterServicesViewData["allServicesFlat"];
};

export function BundleRow({ bundle, allServices }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const isFirst = bundle.globalIndex === 0;
  const isLast = bundle.globalIndex === bundle.globalCount - 1;

  const discountLabel =
    bundle.discountType === DiscountType.PERCENT
      ? `−${bundle.discountValue}%`
      : `−${UI_FMT.priceLabelOrDash(bundle.discountValue)}`;

  return (
    <>
      <div
        className={cn(
          "group rounded-xl border border-border-subtle bg-bg-card p-4 transition-colors hover:border-primary/30",
          !bundle.isEnabled && "opacity-60"
        )}
      >
        <div className="flex items-start gap-2">
          <ReorderControls
            itemId={bundle.id}
            endpoint="/api/master/service-packages/reorder"
            isFirst={isFirst}
            isLast={isLast}
          />
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
          <Button variant="wrapper"
            onClick={() => setEditOpen(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-sm font-medium text-text-main">{bundle.name}</p>
            <p className="mt-0.5 truncate text-xs text-text-sec">
              {bundle.serviceNames.join(" + ")}
            </p>
          </Button>
          {!bundle.isEnabled ? (
            <Badge size="xs" variant="muted">
              {ROW.bundleDisabledBadge}
            </Badge>
          ) : null}
          {bundle.hasDisabledComponent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-3xs text-warning-text">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              <span className="hidden sm:inline">{ROW.bundleWarning}</span>
            </span>
          ) : null}
          <RowMenu
            itemId={bundle.id}
            itemType="bundle"
            isEnabled={bundle.isEnabled}
            onEditClick={() => setEditOpen(true)}
          />
        </div>

        <div className="mt-3 ml-7 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs text-text-sec">
          <span>
            {T.sumLabel}: <span className="text-text-main">{UI_FMT.priceLabelOrDash(bundle.totalPrice)}</span>
          </span>
          <span aria-hidden>·</span>
          <span className="text-success-text">
            {T.discountLabel}: {discountLabel}
          </span>
          <span aria-hidden>·</span>
          <span>
            {T.finalLabel}:{" "}
            <span className="text-sm font-medium text-text-main">
              {UI_FMT.priceLabelOrDash(bundle.finalPrice)}
            </span>
          </span>
          <span aria-hidden>·</span>
          <span>{formatDuration(bundle.totalDurationMin)}</span>
        </div>
      </div>

      {editOpen ? (
        <BundleModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          bundle={bundle}
          allServices={allServices}
        />
      ) : null}
    </>
  );
}
