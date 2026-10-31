"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          {T.title}
        </h1>
        <Button variant="primary" onClick={() => setOpen(true)} data-guide="services">
          <Plus className="h-4 w-4" aria-hidden />
          {T.addService}
        </Button>
      </header>

      <AddServiceDialog
        studioId={studioId}
        pickerOptions={pickerOptions}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
