"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { formatOfferDateShort } from "../lib/format";

const T = UI_TEXT.cabinetMaster.modelOffers.modals.proposeTime;

type Slot = { startLocal: string };

type Props = {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  offerId: string;
  clientName: string;
  offerDateLocal: string;
  offerStartLocal: string;
  offerEndLocal: string;
};

/**
 * Slot picker for "Approve + время". Fetches GET
 * `/api/master/model-offers/[offerId]/time-slots` (30-min slots inside
 * the offer's range, excluding booking conflicts) lazily on open.
 *
 * Empty result is its own state — the message points the master at
 * Close offer or shifting the time window.
 */
export function ProposeTimeModal({
  open,
  onClose,
  applicationId,
  offerId,
  clientName,
  offerDateLocal,
  offerStartLocal,
  offerEndLocal,
}: Props) {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    setError(null);
    setSlots([]);
    void fetch(`/api/master/model-offers/${offerId}/time-slots`)
      .then((response) => response.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok && Array.isArray(json.data?.slots)) {
          setSlots(json.data.slots);
        } else {
          setSlots([]);
        }
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, offerId]);

  const close = () => {
    if (saving) return;
    setSelected(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/master/model-applications/${applicationId}/propose-time`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposedTimeLocal: selected }),
        }
      );
      if (!response.ok) {
        setError(T.errorPropose);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(T.errorPropose);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={close} title={T.title} className="max-w-md">
      <p className="text-sm text-text-sec">
        {T.subtitleTemplate.replace("{name}", clientName)}
      </p>

      <div className="mt-4 rounded-xl border border-border-subtle bg-bg-input/40 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.offerLabel}
        </p>
        <p className="mt-0.5 text-sm text-text-main">
          {T.offerLineTemplate
            .replace("{date}", formatOfferDateShort(offerDateLocal))
            .replace("{start}", offerStartLocal)
            .replace("{end}", offerEndLocal)}
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium text-text-main">{T.slotsLabel}</p>
        {loading ? (
          <p className="text-sm text-text-sec">{T.slotsLoading}</p>
        ) : slots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-3 text-sm italic text-text-sec">
            {T.slotsEmpty}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => {
              const active = selected === slot.startLocal;
              return (
                <button
                  key={slot.startLocal}
                  type="button"
                  onClick={() => setSelected(slot.startLocal)}
                  className={cn(
                    "rounded-lg border px-3 py-2 font-mono text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    active
                      ? "border-primary bg-primary text-white shadow-card"
                      : "border-border-subtle bg-bg-card text-text-main hover:border-primary/40"
                  )}
                >
                  {slot.startLocal}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-text-sec">{T.footnote}</p>

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
        <Button variant="primary" size="md" onClick={submit} disabled={!selected || saving}>
          {saving ? T.submitting : T.submit}
        </Button>
      </div>
    </ModalSurface>
  );
}
