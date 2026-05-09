import { Pencil } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { EditableTextareaRow } from "../editable/editable-textarea-row";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.cabinetMaster.profile.about;

type Props = {
  bio: string | null;
};

export function AboutSection({ bio }: Props) {
  return (
    <SectionShell anchor="about" icon={Pencil} title={T.title} subtitle={T.subtitle}>
      <EditableTextareaRow
        label={T.title}
        value={bio ?? ""}
        fieldKey="bio"
        placeholder={T.placeholder}
        maxLength={600}
        counterTemplate={T.counterTemplate}
      />
    </SectionShell>
  );
}
