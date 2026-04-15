"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { BookingFlowStepper } from "@/features/booking/components/booking-flow/booking-flow-stepper";

type Props = {
  open: boolean;
  onClose: () => void;
  providerId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  providerTimezone: string;
  masterProfileUrl?: string;
};

const SHEET_DRAG_THRESHOLD = 60;

export function BookingBottomSheet({
  open,
  onClose,
  providerId,
  serviceId,
  serviceName,
  servicePrice,
  serviceDurationMin,
  providerTimezone,
  masterProfileUrl,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function handleDragStart(clientY: number) {
    dragStartY.current = clientY;
    dragCurrentY.current = 0;
  }

  function handleDragMove(clientY: number) {
    if (dragStartY.current === null) return;
    dragCurrentY.current = clientY - dragStartY.current;
  }

  function handleDragEnd() {
    if (dragCurrentY.current > SHEET_DRAG_THRESHOLD) {
      onClose();
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={UI_TEXT.publicProfile.booking.title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "flex max-h-[92dvh] flex-col",
              "rounded-t-[28px] border-t border-border-subtle",
              "bg-bg-page shadow-2xl"
            )}
            onTouchStart={(e) => handleDragStart(e.touches[0]?.clientY ?? 0)}
            onTouchMove={(e) => handleDragMove(e.touches[0]?.clientY ?? 0)}
            onTouchEnd={handleDragEnd}
          >
            {/* Drag handle */}
            <div className="flex shrink-0 justify-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
              <h2 className="text-base font-semibold text-text-main">
                {UI_TEXT.publicProfile.booking.title}
              </h2>
              <Button
                variant="secondary"
                size="icon"
                onClick={onClose}
                aria-label={UI_TEXT.actions.close}
                className="rounded-xl"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              <BookingFlowStepper
                providerId={providerId}
                serviceId={serviceId}
                serviceName={serviceName}
                servicePrice={servicePrice}
                serviceDurationMin={serviceDurationMin}
                providerTimezone={providerTimezone}
                masterProfileUrl={masterProfileUrl}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
