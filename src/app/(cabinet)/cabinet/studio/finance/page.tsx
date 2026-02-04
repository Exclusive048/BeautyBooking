import { redirect } from "next/navigation";
import { StudioFinancePage } from "@/features/studio/components/studio-finance-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

export default async function StudioFinanceRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }
  const t = UI_TEXT.studioCabinet.routes;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t.financeTitle}</h2>
        <p className="text-sm text-text-sec">{t.financeSubtitle}</p>
      </header>
      <StudioFinancePage studioId={studioId} />
    </section>
  );
}
