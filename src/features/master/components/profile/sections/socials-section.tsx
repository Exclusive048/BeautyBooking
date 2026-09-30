import { Share2 } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import { SocialEditableRow } from "../editable/social-editable-row";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.social;

type Props = {
  vk: string | null;
  instagram: string | null;
};

/**
 * FEAT-PROVIDER-SOCIALS — master-cabinet «Соцсети» section: free-text VK +
 * Instagram community links (inline-edit autosave). Distinct from the OAuth
 * account-link VK shown read-only in ContactsSection — this is a public
 * community/page link. Not a profile-completion criterion (optional).
 */
export function SocialsSection({ vk, instagram }: Props) {
  return (
    <SectionShell
      anchor="socials"
      icon={Share2}
      title={T.masterSectionTitle}
      subtitle={T.masterSectionSubtitle}
    >
      <SocialEditableRow
        kind="vk"
        label={T.vkLabel}
        placeholder={T.vkPlaceholder}
        value={vk}
      />
      <SocialEditableRow
        kind="instagram"
        label={T.instagramLabel}
        placeholder={T.instagramPlaceholder}
        value={instagram}
      />
    </SectionShell>
  );
}
