"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import type {
  ActiveOfferItem,
  AvailableServiceForOffer,
} from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { OfferFormFields, type OfferFormState } from "./offer-form-fields";

const T = UI_TEXT.cabinetMaster.modelOffers.modals.edit;
const CT = UI_TEXT.cabinetMaster.modelOffers.modals.create;

type Props = {
  open: boolean;
  onClose: () => void;
  offer: ActiveOfferItem;
  services: AvailableServiceForOffer[];
};

function deriveInitial(offer: ActiveOfferItem): OfferFormState {
  return {
    serviceId: offer.primaryService?.id ?? "",
    dateLocal: offer.dateLocal,
    timeStartLocal: offer.timeRangeStartLocal,
    timeEndLocal: offer.timeRangeEndLocal,
    priceRubles: offer.offerPrice && offer.offerPrice > 0 ? String(Math.round(offer.offerPrice / 100)) : "",
    requirements: offer.requirements,
  };
}

/**
 * Edit existing offer. Service select is locked (changing the service
 * would break too many invariants — close + create again is the clean
 * path). Submits a PATCH that the server enforces is only accepted when
 * the offer has zero applications.
 */
export function EditOfferModal({ open, onClose, offer, services }: Props) {
  const router = useRouter();
  const [state, setState] = useState<OfferFormState>(() => deriveInitial(offer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync to props when the user clicks Edit on a different offer without
  // closing the page — `useState` initialiser only runs once.
  const [prevOfferId, setPrevOfferId] = useState(offer.id);
  if (prevOfferId !== offer.id) {
    setPrevOfferId(offer.id);
    setState(deriveInitial(offer));
    setError(null);
  }

  const canSubmit =
    Boolean(state.dateLocal) &&
    Boolean(state.timeStartLocal) &&
    Boolean(state.timeEndLocal) &&
    state.timeStartLocal < state.timeEndLocal &&
    !saving;

  const close = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const priceNumber = parseFloat(state.priceRubles.replace(",", "."));
      const priceKopeks = Number.isFinite(priceNumber) && priceNumber > 0 ? Math.round(priceNumber * 100) : null;
      const response = await fetch(`/api/master/model-offers/${offer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeRangeStartLocal: state.timeStartLocal,
          timeRangeEndLocal: state.timeEndLocal,
          price: priceKopeks,
          requirements: state.requirements,
        }),
      });
      if (!response.ok) {
        setError(T.errorUpdate);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(T.errorUpdate);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={close} title={T.title} className="max-w-xl">
      <p className="mb-4 text-sm text-text-sec">{T.subtitle}</p>
      <OfferFormFields
        state={state}
        onChange={setState}
        services={services}
        serviceReadOnly
      />
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="md" onClick={close} disabled={saving}>
          {CT.cancel}
        </Button>
        <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
          {saving ? T.submitting : T.submit}
        </Button>
      </div>
    </ModalSurface>
  );
}
