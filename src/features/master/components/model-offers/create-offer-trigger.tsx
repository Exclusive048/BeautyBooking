"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AvailableServiceForOffer } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { CreateOfferModal } from "./modals/create-offer-modal";

const T = UI_TEXT.cabinetMaster.modelOffers.activeSection;

type Props = {
  services: AvailableServiceForOffer[];
};

/** Client island that owns the create-modal state for `ActiveOffersSection`. */
export function CreateOfferTrigger({ services }: Props) {
  const [open, setOpen] = useState(false);

  const disabled = services.length === 0;

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? T.soonHint : undefined}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {T.soonAction}
      </Button>
      <CreateOfferModal open={open} onClose={() => setOpen(false)} services={services} />
    </>
  );
}
