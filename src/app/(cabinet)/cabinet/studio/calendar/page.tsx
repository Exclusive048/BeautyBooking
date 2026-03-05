import { redirect } from "next/navigation";
import { StudioCalendarPage } from "@/features/studio/components/studio-calendar-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

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
        <h2 className="text-xl font-semibold">{UI_TEXT.studioCabinet.calendar.title}</h2>
        <p className="text-sm text-text-sec">{UI_TEXT.studioCabinet.calendar.subtitle}</p>
      </header>
      <StudioCalendarPage studioId={studioId} />
    </section>
  );
}
