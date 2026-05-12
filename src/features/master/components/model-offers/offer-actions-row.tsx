"use client";

import { Archive, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import type {
  ActiveOfferItem,
  AvailableServiceForOffer,
} from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { EditOfferModal } from "./modals/edit-offer-modal";
import { pluralize } from "./lib/format";

const T = UI_TEXT.cabinetMaster.modelOffers.offerCard.actions;
const W = UI_TEXT.cabinetMaster.modelOffers.offerCard;

type Props = {
  offer: ActiveOfferItem;
  services: AvailableServiceForOffer[];
};

/**
 * Inline action row replacing 29a's disabled buttons. Visibility:
 *   ACTIVE   → [Edit (locks if any apps)] [Close]
 *   CLOSED   → [Archive]
 *   ARCHIVED → nothing
 *
 * Close + archive go through the branded confirm dialog. For
 * close-with-applications the prompt warns that pending apps will
 * be cascade-rejected.
 */
export function OfferActionsRow({ offer, services }: Props) {
  const router = useRouter();
  const { confirm, modal: confirmModal } = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const editLocked = offer.counts.total > 0;

  const close = async () => {
    if (busy) return;
    const promptText =
      offer.counts.pending + offer.counts.approvedWaitingClient > 0
        ? T.confirmCloseWithAppsTemplate.replace(
            "{count}",
            String(offer.counts.pending + offer.counts.approvedWaitingClient)
          ) +
          " (" +
          pluralize(
            offer.counts.pending + offer.counts.approvedWaitingClient,
            W.wordOne,
            W.wordFew,
            W.wordMany
          ) +
          ")"
        : T.confirmClose;
    const ok = await confirm({
      message: promptText,
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/master/model-offers/${offer.id}/close`, {
        method: "POST",
      });
      if (!response.ok) {
        window.alert(T.errorClose);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (busy) return;
    const ok = await confirm({
      message: T.confirmArchive,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/master/model-offers/${offer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      if (!response.ok) {
        window.alert(T.errorArchive);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (offer.status === "ARCHIVED") return null;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {offer.status === "ACTIVE" ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={editLocked || busy}
              title={editLocked ? T.editLockedHint : undefined}
              onClick={() => setEditOpen(true)}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {T.edit}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={close}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {T.close}
            </Button>
          </>
        ) : null}
        {offer.status === "CLOSED" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={archive}
            className="gap-1.5"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
            {T.archive}
          </Button>
        ) : null}
      </div>

      {editOpen ? (
        <EditOfferModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          offer={offer}
          services={services}
        />
      ) : null}
      {confirmModal}
    </>
  );
}
