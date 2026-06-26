import { redirect } from "next/navigation";
import { StudioSchedulePage } from "@/features/studio-cabinet/schedule/components/studio-schedule-page";
import {
  parseScheduleView,
  type StudioScheduleView,
} from "@/features/studio-cabinet/schedule/lib/view-state";
import { loadStudioScheduleData } from "@/features/studio-cabinet/schedule/server/schedule-data.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { verifyStudioMasterViewToken } from "@/lib/studio/master-view-token";

type SearchParams = {
  view?: string;
  date?: string;
  /**
   * STUDIO-MASTERS-PRIVACY-FIX-A: opaque HMAC token from the masters
   * page deep-links. Decoded server-side against the current studio
   * scope; invalid / cross-studio / expired tokens fall through
   * silently to the full studio calendar.
   */
  master?: string;
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
  // EXP-020: when there's no valid `?date`, leave it undefined so the service
  // resolves the default day in the STUDIO's tz (not the UTC/host calendar day).
  const dateKey =
    params?.date && DATE_KEY_RE.test(params.date) ? params.date : undefined;

  // STUDIO-MASTERS-PRIVACY-FIX-A: verify the deep-link token against
  // the current studio scope before threading it to the page. Invalid
  // / cross-studio / expired tokens silently fall through (no
  // focusMasterId) — the URL is shareable-within-cabinet, not a
  // security boundary; failure modes go to the full calendar view.
  const focusMasterId = params?.master
    ? verifyStudioMasterViewToken({ token: params.master, studioId })
    : null;

  const data = await loadStudioScheduleData({ studioId, dateKey, view });

  return (
    <StudioSchedulePage
      studioId={studioId}
      view={view}
      data={data}
      focusMasterId={focusMasterId ?? undefined}
    />
  );
}
