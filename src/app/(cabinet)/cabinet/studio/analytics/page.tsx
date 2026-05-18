import { redirect } from "next/navigation";
import { StudioAnalyticsPage } from "@/features/studio-cabinet/analytics/components/studio-analytics-page";
import {
  isStudioAnalyticsPeriod,
  isStudioAnalyticsView,
} from "@/features/studio-cabinet/analytics/lib/types";
import { getStudioAnalyticsFeatures } from "@/features/studio-cabinet/analytics/server/analytics-features";
import { loadStudioAnalyticsView } from "@/features/studio-cabinet/analytics/server/analytics-view.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  period?: string;
  view?: string;
  compare?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

export default async function StudioAnalyticsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  try {
    await resolveCurrentStudioAccess(user.id);
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const period = isStudioAnalyticsPeriod(params?.period) ? params!.period : "30d";
  const view = isStudioAnalyticsView(params?.view) ? params!.view : "overview";
  const compare = params?.compare !== "off"; // default ON, mirror master

  const features = await getStudioAnalyticsFeatures(user.id);
  const data = await loadStudioAnalyticsView({
    userId: user.id,
    period,
    view,
    compare,
    features,
  });

  return <StudioAnalyticsPage data={data} />;
}
