"use client";

import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  StudioPackagePickerService,
  StudioPackageView,
} from "../server/packages-data.service";
import { PackageCard } from "./package-card";
import { PackageModal } from "./package-modal";

const T = UI_TEXT.studioCabinet.servicesV2.packages;

type Props = {
  studioId: string;
  packages: StudioPackageView[];
  pickerServices: StudioPackagePickerService[];
};

export function PackagesSection({
  studioId,
  packages,
  pickerServices,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = pickerServices.length >= 2;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-text-main">
            {T.sectionTitle}
          </h2>
          <p className="mt-0.5 max-w-xl text-sm text-text-sec">{T.sectionSubtitle}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCreateOpen(true)}
          disabled={!canCreate}
          title={!canCreate ? T.minServicesHint : undefined}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {T.addPackage}
        </Button>
      </header>

      {packages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-10 text-center">
          <Package className="h-10 w-10 text-text-sec/30" aria-hidden />
          <p className="text-base font-semibold text-text-main">{T.emptyTitle}</p>
          <p className="max-w-md text-sm text-text-sec">
            {canCreate ? T.emptyBody : T.minServicesHint}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <li key={pkg.id}>
              <PackageCard
                studioId={studioId}
                pkg={pkg}
                pickerServices={pickerServices}
              />
            </li>
          ))}
        </ul>
      )}

      <PackageModal
        studioId={studioId}
        mode="create"
        services={pickerServices}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </section>
  );
}
