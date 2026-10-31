import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
import { ClientViewLink } from "@/features/cabinet/components/client-view-link";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { StudioScheduleSettingsBody } from "./studio-schedule-settings-body";

const T = UI_TEXT.studioCabinet.scheduleSettings;

type MasterOption = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type Props = {
  studioId: string;
  masters: MasterOption[];
  selectedMasterId: string | null;
  snapshot: ScheduleEditorSnapshot | null;
  /** Адрес страницы студии — для «Посмотреть глазами клиента» (как у мастера). */
  studioPublicUsername: string | null;
};

/**
 * STUDIO-SCHEDULE-SETTINGS-A Phase A — server orchestrator.
 *
 * Studio cabinet analogue of `MasterPageHeader` + `ScheduleSettingsBody`
 * pattern from the master cabinet. Key adaptation: a master picker
 * gates the tabs since settings are per-master (per the existing
 * schema — no studio-level table). When the studio has no active
 * masters, renders an empty state instead of the tabs.
 */
export function StudioScheduleSettingsPage({
  studioId,
  masters,
  selectedMasterId,
  snapshot,
  studioPublicUsername,
}: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <StudioPageHeader
        backHref="/cabinet/studio/schedule/team"
        caption={T.breadcrumb}
        title={T.title}
        actions={<ClientViewLink publicUsername={studioPublicUsername} />}
      />

      {masters.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-10 text-center">
          <p className="text-base font-semibold text-text-main">
            {T.noMastersTitle}
          </p>
          <p className="max-w-md text-sm text-text-sec">{T.noMastersHint}</p>
        </div>
      ) : (
        <StudioScheduleSettingsBody
          studioId={studioId}
          masters={masters}
          selectedMasterId={selectedMasterId}
          snapshot={snapshot}
        />
      )}
    </div>
  );
}
