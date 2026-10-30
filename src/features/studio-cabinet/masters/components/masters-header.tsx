"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
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
      <StudioPageHeader
        caption={T.caption(counts.total)}
        title={T.title}
        note={T.subtitle(counts.active, counts.disabled, counts.invited)}
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)} data-guide="masters">
            <Plus className="h-4 w-4" aria-hidden />
            {T.inviteButton}
          </Button>
        }
      />
      <InviteMasterDialog
        studioId={studioId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}
