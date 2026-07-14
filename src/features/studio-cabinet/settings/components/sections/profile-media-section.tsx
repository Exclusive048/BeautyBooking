import type { StudioGeneralData } from "../../lib/types";
import { ProfileMediaEditor } from "../profile-media-editor";

type Props = {
  data: StudioGeneralData;
};

/**
 * «Профиль и медиа» — logo/avatar + banner + editable address + contacts +
 * published toggle. Ported from the old orphan `settings/profile` route
 * (LEGACY-STUDIO-SETTINGS-PORT-AND-RETIRE). The editing/save logic lives
 * in the client `ProfileMediaEditor`; this thin server wrapper just hands
 * it the provider + studio ids.
 */
export function ProfileMediaSection({ data }: Props) {
  return <ProfileMediaEditor providerId={data.providerId} studioId={data.studioId} />;
}
