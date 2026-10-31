"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          {T.title}
        </h1>
        <Button variant="primary" onClick={() => setInviteOpen(true)} data-guide="masters">
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
