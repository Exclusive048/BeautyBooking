import { User } from "lucide-react";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import type { MasterProfileViewData } from "@/lib/master/profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { EditableFieldRow } from "../editable/editable-field-row";
import { UsernameEditableRow } from "../editable/username-editable-row";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.cabinetMaster.profile.header;

type Props = {
  providerId: string;
  data: MasterProfileViewData["header"];
};

/**
 * Avatar on the left, editable rows on the right. The nickname uses
 * a dedicated editor (explicit save + confirm dialog) — see
 * `UsernameEditableRow` — because the change rewrites the public
 * profile URL and is too consequential for the autosave pattern used
 * by the other rows.
 */
export function HeaderSection({ providerId, data }: Props) {
  return (
    <SectionShell anchor="header" icon={User} title={T.title}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto,1fr]">
        <div className="flex justify-center sm:justify-start">
          <AvatarEditor
            entityType="MASTER"
            entityId={providerId}
            fallbackUrl={data.avatarUrl}
            sizeClassName="h-28 w-28"
          />
        </div>
        <div>
          <EditableFieldRow
            label={T.nameLabel}
            value={data.displayName}
            fieldKey="displayName"
            maxLength={120}
          />
          <EditableFieldRow
            label={T.taglineLabel}
            value={data.tagline}
            fieldKey="tagline"
            placeholder={T.taglinePlaceholder}
            maxLength={240}
          />
          <UsernameEditableRow value={data.publicUsername} />
        </div>
      </div>
    </SectionShell>
  );
}
