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
  pickerOptions: StudioCategoryPickerOption[];
};

/** Заголовок и «Добавить услугу»; описания и строки со счётчиками нет. */
export function ServicesHeader({ studioId, pickerOptions }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <StudioPageHeader
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
