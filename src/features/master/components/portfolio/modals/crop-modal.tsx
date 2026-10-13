"use client";

import { useRouter } from "next/navigation";
import { ModalSurface } from "@/components/ui/modal-surface";
import { CropPicker } from "@/features/media/components/crop-picker";
import { type CropArea, PORTFOLIO_ASPECT_RATIO } from "@/lib/media/crop-geometry";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.crop;

type Props = {
  open: boolean;
  onClose: () => void;
  assetId: string;
  /** Исходник: обрезка выбирается по нему, а не по уже вырезанному кадру. */
  imageUrl: string;
  /** Сохранённая область — окно открывается на ней. */
  initialCrop: CropArea | null;
};

/**
 * Modal wrapper around the existing `<CropPicker>`. The picker carries
 * its own save logic (PATCH `/api/media/{assetId}/crop`), so we just
 * close + refresh on success.
 *
 * PORTFOLIO-CROP-01: рамка — формат работы портфолио (4:5), тот же, что у
 * плиток; сохранённая область показывается вырезом на всех поверхностях
 * (`portfolio-display.ts`).
 */
export function CropModal({ open, onClose, assetId, imageUrl, initialCrop }: Props) {
  const router = useRouter();

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title} className="max-w-2xl" fullScreenOnMobile>
      <CropPicker
        assetId={assetId}
        imageUrl={imageUrl}
        shape="rect"
        aspectRatio={PORTFOLIO_ASPECT_RATIO}
        initialCropX={initialCrop?.x}
        initialCropY={initialCrop?.y}
        initialCropWidth={initialCrop?.width}
        initialCropHeight={initialCrop?.height}
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
