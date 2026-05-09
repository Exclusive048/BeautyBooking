"use client";

import { AlertTriangle, Package } from "lucide-react";
import { useState } from "react";
import { DiscountType } from "@prisma/client";
import { cn } from "@/lib/cn";
import type {
  MasterServicesViewData,
  ServicePackageView,
} from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { BundleModal } from "./modals/bundle-modal";
import { ReorderControls } from "./reorder-controls";
import { RowMenu } from "./row-menu";
import { formatDuration, formatRubles } from "./lib/format";

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
      : `−${formatRubles(bundle.discountValue)}`;

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
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-sm font-medium text-text-main">{bundle.name}</p>
            <p className="mt-0.5 truncate text-xs text-text-sec">
              {bundle.serviceNames.join(" + ")}
            </p>
          </button>
          {!bundle.isEnabled ? (
            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {ROW.bundleDisabledBadge}
            </span>
          ) : null}
          {bundle.hasDisabledComponent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
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

        <div className="mt-3 ml-7 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-sec">
          <span>
            {T.sumLabel}: <span className="text-text-main">{formatRubles(bundle.totalPrice)}</span>
          </span>
          <span aria-hidden>·</span>
          <span className="text-emerald-700 dark:text-emerald-300">
            {T.discountLabel}: {discountLabel}
          </span>
          <span aria-hidden>·</span>
          <span>
            {T.finalLabel}:{" "}
            <span className="text-sm font-medium text-text-main">
              {formatRubles(bundle.finalPrice)}
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
