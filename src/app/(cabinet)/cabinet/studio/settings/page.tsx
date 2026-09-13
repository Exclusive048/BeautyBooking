import { redirect } from "next/navigation";
import { StudioSettingsPage } from "@/features/studio-cabinet/settings/components/studio-settings-page";
import {
  resolveStudioSettingsSection,
  type StudioSettingsSection,
} from "@/features/studio-cabinet/settings/lib/types";
import { loadStudioSettingsData } from "@/features/studio-cabinet/settings/server/settings-data.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  section?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

/**
 * STUDIO-SETTINGS-A — `/cabinet/studio/settings` rewritten as a
 * single-page multi-section surface. Replaces the legacy redirect to
 * `/cabinet/studio/settings/profile`, which fronted the old 837-LOC
 * tabbed component (still wired through the per-section sub-routes for
 * backwards-compat with deep links to portfolio + main profile editor —
 * those subroutes survive untouched).
 */
export default async function StudioSettingsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  // Легаси-ключи (`general`, `profile-media`) резолвятся в «Профиль» — см.
  // `resolveStudioSettingsSection`.
  const section: StudioSettingsSection = resolveStudioSettingsSection(params?.section);

  const data = await loadStudioSettingsData({ studioId, currentUserId: user.id });
  if (!data) redirect("/403");

  return <StudioSettingsPage data={data} section={section} />;
}
