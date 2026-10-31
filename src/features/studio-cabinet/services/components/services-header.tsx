"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
import type { StudioCategoryPickerOption } from "../lib/types";
import { AddServiceDialog } from "./add-service-dialog";

const T = UI_TEXT.studioCabinet.servicesV2.header;

type Props = {
  studioId: string;
  servicesCount: number;
  categoriesCount: number;
  pickerOptions: StudioCategoryPickerOption[];
};

export function ServicesHeader({
  studioId,
  servicesCount,
  categoriesCount,
  pickerOptions,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <StudioPageHeader
        caption={T.caption
          .replace("{services}", String(servicesCount))
          .replace("{categories}", String(categoriesCount))}
        title={T.title}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)} data-guide="services">
            <Plus className="h-4 w-4" aria-hidden />
            {T.addService}
          </Button>
        }
      />

      <AddServiceDialog
        studioId={studioId}
        pickerOptions={pickerOptions}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
