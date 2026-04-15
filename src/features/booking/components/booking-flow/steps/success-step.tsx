"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

const t = UI_TEXT.publicProfile.bookingFlow;

type Props = {
  serviceName: string;
  servicePrice: number;
  selectedSlot: BookingFlowSlot;
  masterProfileUrl?: string;
};

function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${d}.${m}.${y}`;
}

export function SuccessStep({ serviceName, servicePrice, selectedSlot, masterProfileUrl }: Props) {
  const dateLabel = formatDateKey(selectedSlot.dayKey);
  const timeLabel = selectedSlot.timeText;
  const priceLabel = servicePrice > 0 ? UI_FMT.priceLabel(servicePrice) : UI_TEXT.publicProfile.services.priceOnRequest;

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      {/* Animated checkmark */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15"
      >
        <CheckCircle className="h-8 w-8 text-emerald-500" strokeWidth={1.8} />
      </motion.div>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.3 }}
        className="space-y-1"
      >
        <p className="text-lg font-bold text-text-main">{t.successTitle}</p>
        <p className="text-sm text-text-sec">{t.successSubtitle}</p>
      </motion.div>

      {/* Booking details card */}
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.22, duration: 0.3 }}
        className="w-full rounded-2xl border border-border-subtle bg-bg-input/70 px-4 py-3 text-sm text-left space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-text-sec">{t.confirmService}</span>
          <span className="font-medium text-text-main">{serviceName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-sec">{t.confirmDateTime}</span>
          <span className="font-medium text-text-main">{dateLabel}, {timeLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-sec">{UI_TEXT.publicProfile.booking.total}</span>
          <span className="font-bold text-text-main">{priceLabel}</span>
        </div>
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="flex w-full flex-col gap-2"
      >
        <Button variant="primary" size="lg" className="w-full rounded-xl" asChild>
          <Link href="/cabinet/(user)/bookings">{t.successMyBookings}</Link>
        </Button>
        {masterProfileUrl && (
          <Button variant="secondary" size="lg" className="w-full rounded-xl" asChild>
            <Link href={masterProfileUrl}>{t.successBackToMaster}</Link>
          </Button>
        )}
      </motion.div>
    </div>
  );
}
