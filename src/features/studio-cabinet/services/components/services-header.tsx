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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-3xs uppercase tracking-[0.18em] text-text-sec">
            {T.caption
              .replace("{services}", String(servicesCount))
              .replace("{categories}", String(categoriesCount))}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
            {T.title}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-text-sec">{T.subtitle}</p>
        </div>
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
