"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManualBooking } from "@/features/master/components/manual-booking/manual-booking-provider";

type Props = {
  label: string;
  className?: string;
  variant?: "primary" | "secondary";
};

/**
 * "+ Новая запись" button (fix-01). Opens the modal **inline** on the
 * current route via the layout-level `ManualBookingProvider` —
 * replaces the legacy `<Link href="/cabinet/master/dashboard?manual=1">`
 * which silently navigated to the dashboard regardless of where the
 * user clicked.
 */
export function NewBookingButton({ label, className, variant = "primary" }: Props) {
  const { open, enabled } = useManualBooking();
  return (
    <Button
      type="button"
      variant={variant}
      size="md"
      className={className}
      onClick={() => open()}
      disabled={!enabled}
    >
      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
