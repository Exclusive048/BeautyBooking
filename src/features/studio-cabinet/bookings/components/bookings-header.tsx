"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import { CreateBookingDialog } from "@/features/studio-cabinet/schedule/components/dialogs/create-booking-dialog";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";

const T = UI_TEXT.studioCabinet.bookingsV2.header;

type Props = {
  studioId: string;
  visibleCount: number;
  masters: ScheduleMasterColumn[];
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceKopeks: number;
    masterIds: string[];
  }>;
  /** TZ-DISPLAY-SALON-PARITY-01: salon tz for the create-booking dialog. */
  timezone: string;
};

export function BookingsHeader({
  studioId,
  visibleCount,
  masters,
  services,
  timezone,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-3xs uppercase tracking-[0.18em] text-text-sec">
            {T.caption.replace("{count}", String(visibleCount))}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
            {T.title}
          </h1>
          <p className="mt-1 text-sm text-text-sec">{T.subtitle}</p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {T.newBooking}
        </Button>
      </header>

      <CreateBookingDialog
        studioId={studioId}
        masterId={null}
        startAtUtc={null}
        masters={masters}
        services={services}
        timezone={timezone}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
