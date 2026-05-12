"use client";

import { Camera, ImageIcon, Layers, Maximize, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  PortfolioCategoryOption,
} from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { UploadModal } from "./modals/upload-modal";

const T = UI_TEXT.cabinetMaster.portfolioPage.empty;

type Props = {
  categories: PortfolioCategoryOption[];
};

/**
 * Empty state with three small icon tips below the CTA. Embedded as a
 * client island because the CTA opens the same upload modal as the
 * header's "Добавить работы" — we keep the modal mounted here too so
 * the master can publish their first item without touching the header.
 */
export function PortfolioEmptyState({ categories }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-input">
          <Camera className="h-6 w-6 text-text-sec/60" aria-hidden />
        </div>
        <h3 className="font-display text-lg text-text-main">{T.title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-sec">{T.body}</p>
        <Button variant="primary" size="md" onClick={() => setOpen(true)} className="mt-5 gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          {T.cta}
        </Button>
        <ul className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-3 text-text-sec">
          <Tip icon={ImageIcon} label={T.tip1} />
          <Tip icon={Maximize} label={T.tip2} />
          <Tip icon={Layers} label={T.tip3} />
        </ul>
      </div>
      <UploadModal
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
      />
    </>
  );
}

function Tip({ icon: Icon, label }: { icon: typeof ImageIcon; label: string }) {
  return (
    <li className="flex flex-col items-center gap-1 text-[11px]">
      <Icon className="h-4 w-4" aria-hidden />
      <span>{label}</span>
    </li>
  );
}
