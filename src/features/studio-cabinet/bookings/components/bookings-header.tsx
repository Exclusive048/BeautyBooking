"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
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
      <StudioPageHeader
        caption={T.caption.replace("{count}", String(visibleCount))}
        title={T.title}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {T.newBooking}
          </Button>
        }
      />

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
