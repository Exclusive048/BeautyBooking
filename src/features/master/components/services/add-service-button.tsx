"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ServiceCategoryOption } from "@/lib/master/services-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { ServiceModal } from "./modals/service-modal";

const T = UI_TEXT.cabinetMaster.servicesPage;

type Props = {
  categories: ServiceCategoryOption[];
  onlinePaymentsAvailable: boolean;
  /** Render variant — header CTA (primary, with icon) or empty-state CTA (large primary). */
  variant?: "header" | "empty";
};

export function AddServiceButton({ categories, onlinePaymentsAvailable, variant = "header" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        data-guide="services"
        variant="primary"
        size={variant === "empty" ? "lg" : "md"}
        onClick={() => setOpen(true)}
        className="gap-1.5"
        // UI-18: у компактного варианта видимая подпись — существительное
        // («Услуга»), и доступное имя без этого было бы «Услуга». Пустое
        // состояние уже показывает глагол целиком, там подмена не нужна.
        aria-label={variant === "empty" ? undefined : T.addServiceAria}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {variant === "empty" ? T.empty.cta : T.addServiceCta}
      </Button>
      {open ? (
        <ServiceModal
          open={open}
          onClose={() => setOpen(false)}
          mode="create"
          categories={categories}
          onlinePaymentsAvailable={onlinePaymentsAvailable}
        />
      ) : null}
    </>
  );
}
