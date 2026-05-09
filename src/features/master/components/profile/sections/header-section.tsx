import { User } from "lucide-react";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import type { MasterProfileViewData } from "@/lib/master/profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { EditableFieldRow } from "../editable/editable-field-row";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.cabinetMaster.profile.header;

type Props = {
  providerId: string;
  data: MasterProfileViewData["header"];
};

/**
 * Avatar (existing media-component reuse) on the left, three editable
 * rows on the right. `publicUsername` is read-only with a "Скоро" hint
 * — editing requires alias-table juggling that lives on the 31b backlog.
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
          <UsernameRow username={data.publicUsername} />
        </div>
      </div>
    </SectionShell>
  );
}

function UsernameRow({ username }: { username: string | null }) {
  const isSet = Boolean(username && username.trim().length > 0);
  return (
    <div className="flex items-start gap-3 border-b border-border-subtle py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.usernameLabel}
          </p>
          <span className="font-mono text-[10px] text-text-sec">· {T.usernameSoonHint}</span>
        </div>
        <p className="mt-1 break-all text-sm text-text-main">
          {isSet ? (
            <>
              <span className="text-text-sec">{T.usernamePrefix}</span>
              <span>{username}</span>
            </>
          ) : (
            <span className="italic text-text-sec">{T.usernameNotSet}</span>
          )}
        </p>
      </div>
    </div>
  );
}
