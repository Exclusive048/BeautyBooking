"use client";

import { Check, MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApplicationItem } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ProposeTimeModal } from "./modals/propose-time-modal";
import { RejectApplicationModal } from "./modals/reject-application-modal";

const T = UI_TEXT.cabinetMaster.modelOffers.applicationCard.actions;

type Props = {
  application: ApplicationItem;
  /** Plain offer time bounds (already in `application.offer` snapshot, but
   * surfaced separately so the action island doesn't need to walk
   * nullable fields at runtime). */
  offerStartLocal: string;
  offerEndLocal: string;
};

/**
 * Three-button row replacing 29a's disabled stubs. "Approve как есть"
 * reuses the same propose-time endpoint with `offer.timeRangeStartLocal`
 * — the only path that creates a Booking is the client confirm flow, so
 * this stays a single state-machine edge: PENDING → APPROVED_WAITING_CLIENT.
 */
export function ApplicationActionsIsland({
  application,
  offerStartLocal,
  offerEndLocal,
}: Props) {
  const router = useRouter();
  const [proposeOpen, setProposeOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [savingQuick, setSavingQuick] = useState(false);

  const approveQuick = async () => {
    if (savingQuick) return;
    setSavingQuick(true);
    try {
      const response = await fetch(
        `/api/master/model-applications/${application.id}/propose-time`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposedTimeLocal: offerStartLocal }),
        }
      );
      if (!response.ok) {
        window.alert(T.errorApprove);
        return;
      }
      router.refresh();
    } finally {
      setSavingQuick(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled
          title={T.chatComingSoon}
          className="gap-1.5"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          {T.chat}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={savingQuick}
          onClick={() => setRejectOpen(true)}
          className="gap-1.5"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {T.reject}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={savingQuick}
          onClick={approveQuick}
          className="gap-1.5"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {T.approveQuick}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={savingQuick}
          onClick={() => setProposeOpen(true)}
          className="gap-1.5"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {T.approveWithTime}
        </Button>
      </div>

      {rejectOpen ? (
        <RejectApplicationModal
          open={rejectOpen}
          onClose={() => setRejectOpen(false)}
          applicationId={application.id}
          clientName={application.client.displayName}
        />
      ) : null}
      {proposeOpen ? (
        <ProposeTimeModal
          open={proposeOpen}
          onClose={() => setProposeOpen(false)}
          applicationId={application.id}
          offerId={application.offer.id}
          clientName={application.client.displayName}
          offerDateLocal={application.offer.dateLocal}
          offerStartLocal={offerStartLocal}
          offerEndLocal={offerEndLocal}
        />
      ) : null}
    </>
  );
}
