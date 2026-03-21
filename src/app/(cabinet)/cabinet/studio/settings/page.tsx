import { redirect } from "next/navigation";
import { StudioSettingsPage } from "@/features/studio/components/studio-settings-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

type PageProps = {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
};

export default async function StudioSettingsIndexPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let providerId: string;
  let studioId: string;
  try {
    ({ providerId, studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{UI_TEXT.studioCabinet.settings.profile}</h2>
        <p className="text-sm text-neutral-600">{UI_TEXT.studio.profile.subtitle}</p>
      </header>
      <StudioSettingsPage providerId={providerId} studioId={studioId} initialTab={params?.tab ?? null} />
    </section>
  );
}
