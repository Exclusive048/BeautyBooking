"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ManualBookingModal } from "@/features/master/components/dashboard/manual-booking-modal";
import type { DashboardServiceLite } from "@/lib/master/dashboard.service";

/**
 * Cabinet-wide manual-booking modal mount (fix-01).
 *
 * Lifts the modal out of the dashboard page so it can be opened from
 * any master cabinet route (sidebar, bookings page, schedule page,
 * empty-cell click, etc.) without navigating to /dashboard.
 *
 * URL contract is preserved — modal still reads `?manual=1` and
 * optional `?prefillTime=ISO` from the current route. Triggers do
 * `router.replace(pathname + "?manual=1", { scroll: false })` so the
 * URL gains the param without leaving the page.
 */
type Preset = { prefillTime?: string };

type ManualBookingContextValue = {
  open: (preset?: Preset) => void;
  enabled: boolean;
};

const ManualBookingContext = createContext<ManualBookingContextValue | null>(null);

type Props = {
  /** Server-fetched services + isSolo. `null` → master has no provider yet,
   * trigger is rendered as a no-op (consumers can check `enabled`). */
  data: { services: DashboardServiceLite[]; isSolo: boolean } | null;
  children: ReactNode;
};

export function ManualBookingProvider({ data, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = useCallback<ManualBookingContextValue["open"]>(
    (preset) => {
      if (!data) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("manual", "1");
      if (preset?.prefillTime) {
        next.set("prefillTime", preset.prefillTime);
      } else {
        next.delete("prefillTime");
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [data, pathname, router, searchParams],
  );

  return (
    <ManualBookingContext.Provider value={{ open, enabled: Boolean(data) }}>
      {children}
      {data ? (
        <ManualBookingModal services={data.services} isSolo={data.isSolo} />
      ) : null}
    </ManualBookingContext.Provider>
  );
}

export function useManualBooking(): ManualBookingContextValue {
  const ctx = useContext(ManualBookingContext);
  if (!ctx) {
    // Defensive default — when the provider is absent (e.g., outside
    // the master cabinet) consumers don't crash; they get a no-op.
    return { open: () => {}, enabled: false };
  }
  return ctx;
}
