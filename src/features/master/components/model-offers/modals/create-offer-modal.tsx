"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import type { AvailableServiceForOffer } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { OfferFormFields, type OfferFormState } from "./offer-form-fields";

const T = UI_TEXT.cabinetMaster.modelOffers.modals.create;

type Props = {
  open: boolean;
  onClose: () => void;
  services: AvailableServiceForOffer[];
};

const EMPTY_STATE: OfferFormState = {
  serviceId: "",
  dateLocal: "",
  timeStartLocal: "10:00",
  timeEndLocal: "13:00",
  priceRubles: "",
  requirements: [],
};

/**
 * Modal for publishing a new model offer. Submits to existing
 * `POST /api/master/model-offers` (which falls back to plain `serviceId`
 * for solo masters — we always pass `serviceId` in both `masterServiceId`
 * and `serviceIds[]` fields). Free offers (price empty) post `price: null`.
 */
export function CreateOfferModal({ open, onClose, services }: Props) {
  const router = useRouter();
  const [state, setState] = useState<OfferFormState>(EMPTY_STATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    Boolean(state.serviceId) &&
    Boolean(state.dateLocal) &&
    Boolean(state.timeStartLocal) &&
    Boolean(state.timeEndLocal) &&
    state.timeStartLocal < state.timeEndLocal &&
    !saving;

  const close = () => {
    if (saving) return;
    setState(EMPTY_STATE);
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
      const response = await fetch("/api/master/model-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterServiceId: state.serviceId,
          serviceIds: [state.serviceId],
          dateLocal: state.dateLocal,
          timeRangeStartLocal: state.timeStartLocal,
          timeRangeEndLocal: state.timeEndLocal,
          price: priceKopeks,
          requirements: state.requirements,
        }),
      });
      if (!response.ok) {
        setError(T.errorCreate);
        return;
      }
      setState(EMPTY_STATE);
      router.refresh();
      onClose();
    } catch {
      setError(T.errorCreate);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={close} title={T.title} className="max-w-xl">
      <p className="mb-4 text-sm text-text-sec">{T.subtitle}</p>
      <OfferFormFields state={state} onChange={setState} services={services} />
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
          {T.cancel}
        </Button>
        <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
          {saving ? T.submitting : T.submit}
        </Button>
      </div>
    </ModalSurface>
  );
}
