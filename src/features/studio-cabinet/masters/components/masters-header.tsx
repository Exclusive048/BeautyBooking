"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioMastersCounts } from "../server/types";
import { InviteMasterDialog } from "./invite-master-dialog";

const T = UI_TEXT.studioCabinet.mastersV2.header;

export function MastersHeader({
  studioId,
  counts,
}: {
  studioId: string;
  counts: StudioMastersCounts;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.caption.replace("{count}", String(counts.total))}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
            {T.title}
          </h1>
          <p className="mt-1 text-sm text-text-sec">
            {T.subtitleTemplate
              .replace("{active}", String(counts.active))
              .replace("{disabled}", String(counts.disabled))
              .replace("{invited}", String(counts.invited))}
          </p>
        </div>
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {T.inviteButton}
        </Button>
      </header>
      <InviteMasterDialog
        studioId={studioId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}
