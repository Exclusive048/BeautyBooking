import { redirect } from "next/navigation";
import { MediaEntityType } from "@prisma/client";
import { PortfolioEditor } from "@/features/media/components/portfolio-editor";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

export default async function StudioSettingsPortfolioPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let providerId: string;
  try {
    ({ providerId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-text-main">{UI_TEXT.studioCabinet.settings.portfolio}</h1>
      <div className="lux-card rounded-[24px] p-5">
        <PortfolioEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit />
      </div>
    </section>
  );
}
