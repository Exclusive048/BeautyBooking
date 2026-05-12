"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  PortfolioCategoryOption,
} from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { UploadModal } from "./modals/upload-modal";

const T = UI_TEXT.cabinetMaster.portfolioPage;

type Props = {
  categories: PortfolioCategoryOption[];
};

/** Header-mounted CTA. Owns the upload-modal open state so the rest of
 * the page can stay RSC. */
export function AddButton({ categories }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="md" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" aria-hidden />
        {T.addCta}
      </Button>
      <UploadModal open={open} onClose={() => setOpen(false)} categories={categories} />
    </>
  );
}
