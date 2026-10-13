import { Share2 } from "lucide-react";
import { SOCIAL_KINDS, type SocialKind } from "@/lib/providers/social-links";
import * as UI_TEXT from "@/lib/ui/text";
import { SocialEditableRow } from "../editable/social-editable-row";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.social;

type Props = {
  links: Record<SocialKind, string | null>;
};

/**
 * FEAT-PROVIDER-SOCIALS — master-cabinet «Соцсети» section: free-text VK /
 * Instagram / Telegram / MAX community links (inline-edit autosave). Distinct
 * from the OAuth account-link VK shown read-only in ContactsSection — this is a
 * public community/page link. Not a profile-completion criterion (optional).
 */
export function SocialsSection({ links }: Props) {
  return (
    <SectionShell
      anchor="socials"
      icon={Share2}
      title={T.masterSectionTitle}
      subtitle={T.masterSectionSubtitle}
    >
      {SOCIAL_KINDS.map((kind) => (
        <SocialEditableRow
          key={kind}
          kind={kind}
          label={T.kinds[kind].label}
          placeholder={T.kinds[kind].placeholder}
          value={links[kind]}
        />
      ))}
    </SectionShell>
  );
}
