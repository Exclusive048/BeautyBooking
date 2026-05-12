"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MasterServicesViewData } from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { BundleModal } from "./modals/bundle-modal";

const T = UI_TEXT.cabinetMaster.servicesPage;

type Props = {
  allServices: MasterServicesViewData["allServicesFlat"];
};

export function AddBundleButton({ allServices }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" aria-hidden />
        {T.addBundleCta}
      </Button>
      {open ? (
        <BundleModal
          open={open}
          onClose={() => setOpen(false)}
          mode="create"
          allServices={allServices}
        />
      ) : null}
    </>
  );
}
