"use client";

import { useRouter } from "next/navigation";
import { ModalSurface } from "@/components/ui/modal-surface";
import { CropPicker } from "@/features/media/components/crop-picker";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.crop;

type Props = {
  open: boolean;
  onClose: () => void;
  assetId: string;
  imageUrl: string;
};

/**
 * Modal wrapper around the existing `<CropPicker>`. The picker carries
 * its own save logic (PATCH `/api/media/{assetId}/crop`), so we just
 * close + refresh on success.
 *
 * Square aspect (1:1) — matches the portfolio grid's tile shape.
 */
export function CropModal({ open, onClose, assetId, imageUrl }: Props) {
  const router = useRouter();

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title} className="max-w-2xl">
      <CropPicker
        assetId={assetId}
        imageUrl={imageUrl}
        shape="rect"
        aspectRatio={1}
        previewSizes={[120, 64]}
        onSave={() => {
          onClose();
          router.refresh();
        }}
        onSkip={onClose}
      />
    </ModalSurface>
  );
}
