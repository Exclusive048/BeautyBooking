"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { CreateBookingDialog } from "@/features/studio-cabinet/schedule/components/dialogs/create-booking-dialog";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.studioCabinet.clientsV2;

type ServiceOption = {
  id: string;
  name: string;
  durationMin: number;
  priceKopeks: number;
  masterIds: string[];
};

type Props = {
  studioId: string;
  client: { name: string; phone: string };
  masters: ScheduleMasterColumn[];
  services: ServiceOption[];
  /** TZ-DISPLAY-SALON-PARITY-01: salon tz for the create-booking dialog. */
  timezone: string;
};

/**
 * STUDIO-CLIENT-WRITE-DIALOG-A — replaces the previous redirect-to-
 * calendar `<Link>` per studio client row with an in-context dialog.
 * The dialog seeds `clientName` + `clientPhone` from the row, then
 * presents the standard time / service / master pickers (same
 * dialog the «Новая запись» header button + calendar empty-slot
 * click open — Option A from the audit: extend, don't fork).
 *
 * Per-row client island so the studio clients table can stay a
 * server component. Dialog state is scoped to one row; opening
 * another row's button independently spawns its own dialog.
 */
export function ClientBookButton({ studioId, client, masters, services, timezone }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="wrapper"
        onClick={() => setOpen(true)}
        className="inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
        aria-label={T.actions.book}
        title={T.actions.book}
      >
        <CalendarPlus className="h-4 w-4" aria-hidden />
      </Button>
      <CreateBookingDialog
        studioId={studioId}
        masterId={null}
        startAtUtc={null}
        masters={masters}
        services={services}
        timezone={timezone}
        open={open}
        onClose={() => setOpen(false)}
        prefilledClient={client}
      />
    </>
  );
}
