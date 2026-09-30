"use client";

import { Drawer } from "@/components/ui/drawer";
import * as UI_TEXT from "@/lib/ui/text";
import { BookingFlowStepper } from "@/features/booking/components/booking-flow/booking-flow-stepper";

type Props = {
  open: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  providerTimezone: string;
  masterProfileUrl?: string;
};

/**
 * MODAL-UNIFY-IMPL-A: shell migrated to unified `<Drawer
 * side="bottom" drag>` (preserves the original drag-to-dismiss
 * UX via the primitive's built-in handler). Public API preserved.
 * The `BookingFlowStepper` content is reused verbatim — the
 * stepper handles its own state, no booking-creation logic was
 * touched.
 */
export function BookingBottomSheet({
  open,
  onClose,
  providerId,
  providerName,
  serviceId,
  serviceName,
  servicePrice,
  serviceDurationMin,
  providerTimezone,
  masterProfileUrl,
}: Props) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="bottom"
      size="xl"
      title={UI_TEXT.publicProfile.booking.title}
      drag
    >
      <div className="px-5 pb-6">
        <BookingFlowStepper
          providerId={providerId}
          providerName={providerName}
          serviceId={serviceId}
          serviceName={serviceName}
          servicePrice={servicePrice}
          serviceDurationMin={serviceDurationMin}
          providerTimezone={providerTimezone}
          masterProfileUrl={masterProfileUrl}
        />
      </div>
    </Drawer>
  );
}
