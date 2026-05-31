"use client";

import { Camera, ImageIcon, Layers, Maximize, Plus } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
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
      <EmptyState
        variant="card"
        iconSize="lg"
        icon={Camera}
        title={T.title}
        description={T.body}
        action={{
          label: T.cta,
          onClick: () => setOpen(true),
          variant: "primary",
          leadingIcon: Plus,
        }}
      >
        <ul className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-3 text-text-sec">
          <Tip icon={ImageIcon} label={T.tip1} />
          <Tip icon={Maximize} label={T.tip2} />
          <Tip icon={Layers} label={T.tip3} />
        </ul>
      </EmptyState>
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
