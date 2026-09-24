"use client";

import { useMemo, useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Select } from "@/components/ui/select";
import type { StudioPortfolioAttributionData } from "@/lib/studios/portfolio-items";
import { UI_TEXT } from "@/lib/ui/text";

export type PortfolioCaptionValue = {
  performerId: string | null;
  serviceId: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  masters: StudioPortfolioAttributionData["masters"];
  services: StudioPortfolioAttributionData["services"];
  initial: PortfolioCaptionValue;
  onSave: (value: PortfolioCaptionValue) => Promise<void>;
};

/**
 * STUDIO-PORTFOLIO-FEED (2026-09-24) — подпись фото студии: кто из мастеров
 * и какую услугу делал. Показывается на фото в ленте и в историях на главной.
 *
 * Выбран мастер — список услуг сужается до тех, что он выполняет (`MasterService`),
 * чтобы подпись не противоречила записи; у мастера без привязанных услуг список
 * полный. Уже выбранная услуга остаётся в списке, даже если связь сняли.
 */
export function PortfolioCaptionDialog({ open, onClose, masters, services, initial, onSave }: Props) {
  const T = UI_TEXT.media.portfolio;
  const [performerId, setPerformerId] = useState<string | null>(initial.performerId);
  const [serviceId, setServiceId] = useState<string | null>(initial.serviceId);

  const serviceOptions = useMemo(() => {
    const master = masters.find((item) => item.id === performerId);
    if (!master || master.serviceIds.length === 0) return services;
    const allowed = new Set(master.serviceIds);
    return services.filter((service) => allowed.has(service.id) || service.id === serviceId);
  }, [masters, services, performerId, serviceId]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={T.captionDialogTitle}
      size="sm"
      submitLabel={T.captionSave}
      cancelLabel={T.captionCancel}
      onSubmit={async () => {
        await onSave({ performerId, serviceId });
      }}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{T.captionDialogHint}</p>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-main">{T.captionMasterLabel}</span>
          <Select
            value={performerId ?? ""}
            onChange={(event) => setPerformerId(event.target.value || null)}
          >
            <option value="">{T.captionMasterNone}</option>
            {masters.map((master) => (
              <option key={master.id} value={master.id}>
                {master.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-main">{T.captionServiceLabel}</span>
          <Select
            value={serviceId ?? ""}
            onChange={(event) => setServiceId(event.target.value || null)}
          >
            <option value="">{T.captionServiceNone}</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </FormDialog>
  );
}
