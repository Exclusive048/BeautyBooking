"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import { DeleteStudioDialog } from "../delete-studio-dialog";
import { SectionCard } from "../section-card";
import type { StudioGeneralData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.danger;

type Props = {
  studio: StudioGeneralData;
};

/**
 * Danger zone — OWNER only (the nav already hides this section when
 * `scope.canDanger` is false). Ровно ОДНО действие: безвозвратное удаление
 * через `DELETE /api/cabinet/studio/delete` → `deleteStudioCabinet`.
 *
 * FIX-STUDIO-ARCHIVE-REMOVED: «Архивировать студию» отсюда убрано. Действие
 * писало `Provider.isPublished = false` — ровно то же, что тумблер
 * «Опубликован» в разделе «Профиль», — но стояло в разделе необратимых
 * действий и подтверждалось модальным `confirm`, то есть обратимое переключение
 * видимости выглядело как точка невозврата. Две кнопки для одного бита ещё и
 * расходились по состоянию: тумблер профиля сохранялся общей кнопкой формы, а
 * «Архивировать» — сразу, поэтому вернувшись в «Профиль» пользователь видел
 * несохранённое `true` поверх уже записанного `false`.
 */
export function DangerSection({ studio }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <div className="space-y-4">
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
