import { redirect } from "next/navigation";
import { StudioSchedulePage } from "@/features/studio-cabinet/schedule/components/studio-schedule-page";
import { toDateKey } from "@/features/studio-cabinet/schedule/lib/time-grid";
import {
  parseScheduleView,
  type StudioScheduleView,
} from "@/features/studio-cabinet/schedule/lib/view-state";
import { loadStudioScheduleData } from "@/features/studio-cabinet/schedule/server/schedule-data.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  view?: string;
  date?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function StudioCalendarRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const view: StudioScheduleView = parseScheduleView(params?.view);
  const dateKey =
    params?.date && DATE_KEY_RE.test(params.date)
      ? params.date
      : toDateKey(new Date());

  const data = await loadStudioScheduleData({ studioId, dateKey, view });

  return <StudioSchedulePage studioId={studioId} view={view} data={data} />;
}
