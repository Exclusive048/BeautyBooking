"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
import { InviteMasterDialog } from "./invite-master-dialog";

const T = UI_TEXT.studioCabinet.mastersV2.header;

/**
 * Заголовок раздела и кнопка приглашения. Строк со счётчиками нет: число
 * мастеров по статусам — на фильтрах списка.
 */
export function MastersHeader({ studioId }: { studioId: string }) {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      <StudioPageHeader
        title={T.title}
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
