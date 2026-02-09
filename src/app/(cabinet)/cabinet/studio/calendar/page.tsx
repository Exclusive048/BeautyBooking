import { redirect } from "next/navigation";
import { StudioCalendarPage } from "@/features/studio/components/studio-calendar-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioCalendarRoute() {
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
        <h2 className="text-xl font-semibold">Календарь</h2>
        <p className="text-sm text-text-sec">Записи и блоки студии в одном месте.</p>
      </header>
      <StudioCalendarPage studioId={studioId} />
    </section>
  );
}
