import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { prisma } from "@/lib/prisma";
import { PublicSettingsClient } from "@/features/billing/components/public-settings-client";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

export default async function StudioSettingsPublicPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasAccess = await hasStudioAdminAccess(user.id);
  if (!hasAccess) redirect("/403");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { provider: { select: { name: true } } },
  });
  const studioName = studio?.provider?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">
          {UI_TEXT.billing.publicPage.title}
        </h2>
        <p className="text-sm text-text-sec">{UI_TEXT.billing.publicPage.subtitle}</p>
      </header>
      <PublicSettingsClient
        endpoint="/api/cabinet/studio/public-username"
        name={studioName}
      />
    </section>
  );
}
