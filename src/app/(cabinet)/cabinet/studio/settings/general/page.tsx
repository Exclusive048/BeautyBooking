import { redirect } from "next/navigation";
import { StudioSettingsPage } from "@/features/studio/components/studio-settings-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

export default async function StudioGeneralSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let providerId: string;
  let studioId: string;
  try {
    ({ providerId, studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">
          {UI_TEXT.studioCabinet.settings.general}
        </h2>
        <p className="text-sm text-text-sec">{UI_TEXT.studio.settingsPanel.settingsSubtitle}</p>
      </header>
      <StudioSettingsPage
        providerId={providerId}
        studioId={studioId}
        initialTab="settings"
        hideTabNav
      />
    </section>
  );
}
