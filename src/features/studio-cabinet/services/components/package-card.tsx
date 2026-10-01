"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Package, Pencil, Sparkles, Trash2 } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  StudioPackagePickerService,
  StudioPackageView,
} from "../server/packages-data.service";
import { DeletePackageDialog } from "./delete-package-dialog";
import { PackageModal } from "./package-modal";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.studioCabinet.servicesV2.package;

type Props = {
  studioId: string;
  pkg: StudioPackageView;
  pickerServices: StudioPackagePickerService[];
};

export function PackageCard({ studioId, pkg, pickerServices }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <article className="bg-brand-gradient-soft relative overflow-hidden rounded-2xl border border-border-subtle/70 p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/15 blur-2xl"
        />
        <div className="relative space-y-3">
          <header className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-grid h-7 w-7 place-items-center rounded-lg bg-bg-card/85 text-accent-text"
              >
                <Package className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <h3 className="font-display text-base text-text-main">{pkg.name}</h3>
              {!pkg.isEnabled ? (
                <span className="rounded-full border border-border-subtle bg-bg-card px-1.5 py-0.5 font-mono text-3xs uppercase tracking-wide text-text-sec">
                  {T.pausedBadge}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="wrapper"
                onClick={() => setEditOpen(true)}
                className="inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-card hover:text-text-main"
                aria-label={T.edit}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button variant="wrapper"
                onClick={() => setDeleteOpen(true)}
                className="inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-card hover:text-danger-text"
                aria-label={T.delete}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </header>

          <div>
            <p className="mb-1.5 font-mono text-3xs uppercase tracking-[0.18em] text-text-sec">
              {T.componentsLabel.replace("{count}", String(pkg.components.length))}
            </p>
            <ul className="space-y-1">
              {pkg.components.map((component) => (
                <li
                  key={component.serviceId}
                  className="flex items-center gap-2 text-sm text-text-main"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60"
                  />
                  <span className="truncate">{component.name}</span>
                  {!component.isEnabled ? (
                    <span className="text-3xs text-warning-text">
                      ({T.componentDisabled})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {pkg.hasDisabledComponent ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-warning-border bg-warning-surface px-2.5 py-1.5 text-2xs text-warning-text">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {T.warningDisabledComponents}
            </p>
          ) : null}

          <div className="flex items-end justify-between gap-3 border-t border-border-subtle/70 pt-3">
            <div>
              <p className="text-3xs uppercase tracking-wider text-text-sec">
                {T.finalPriceLabel}
              </p>
              <p className="font-display text-xl text-text-main">
                {UI_FMT.priceLabel(pkg.finalPrice)}
              </p>
              {pkg.discountAmount > 0 ? (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent-text">
                  <Sparkles className="h-3 w-3" aria-hidden strokeWidth={1.8} />
                  {T.savingsTemplate.replace(
                    "{amount}",
                    UI_FMT.priceLabel(pkg.discountAmount),
                  )}
                </p>
              ) : null}
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-bg-card/85 px-2.5 py-1 text-xs text-text-sec">
              <Clock className="h-3 w-3" aria-hidden strokeWidth={1.8} />
              {T.durationTemplate.replace("{min}", String(pkg.totalDurationMin))}
            </div>
          </div>
        </div>
      </article>

      <PackageModal
        studioId={studioId}
        mode="edit"
        pkg={pkg}
        services={pickerServices}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <DeletePackageDialog
        studioId={studioId}
        packageId={pkg.id}
        packageName={pkg.name}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />

    </>
  );
}
