"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import { ArchiveToggle } from "../archive-toggle";
import { DeleteStudioDialog } from "../delete-studio-dialog";
import { SectionCard } from "../section-card";
import type { StudioGeneralData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.danger;

type Props = {
  studio: StudioGeneralData;
};

/**
 * Danger zone — OWNER only (the nav already hides this section when
 * `scope.canDanger` is false). Two reversible/irreversible actions:
 *   1. Archive (`Provider.isPublished = false`) via PATCH /api/studios/[id]
 *   2. Permanent delete via existing `DELETE /api/cabinet/studio/delete`
 *      → `deleteStudioCabinet` lib helper (anonymisation partial — known
 *      backlog item, not fixed here).
 */
export function DangerSection({ studio }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <div className="space-y-4">
      <SectionCard danger title={T.archiveTitle} description={T.archiveDesc}>
        <ArchiveToggle studioId={studio.studioId} isPublished={studio.isPublished} />
      </SectionCard>

      <SectionCard danger title={T.deleteTitle} description={T.deleteDesc}>
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          {T.deleteButton}
        </Button>
      </SectionCard>

      <DeleteStudioDialog
        studioName={studio.name}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
