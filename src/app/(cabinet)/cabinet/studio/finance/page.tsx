import { redirect } from "next/navigation";
import { StudioFinancePage } from "@/features/studio/components/studio-finance-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioFinanceRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Finance</h2>
        <p className="text-sm text-neutral-600">Visits and revenue analytics from booking snapshots.</p>
      </header>
      <StudioFinancePage studioId={studioId} />
    </section>
  );
}
