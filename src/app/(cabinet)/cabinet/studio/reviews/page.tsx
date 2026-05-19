import { redirect } from "next/navigation";
import { StudioReviewsPage } from "@/features/studio-cabinet/reviews/components/studio-reviews-page";
import { isStudioReviewFilter } from "@/features/studio-cabinet/reviews/lib/types";
import { loadStudioReviewsList } from "@/features/studio-cabinet/reviews/server/reviews-data.service";
import { loadStudioReviewsStats } from "@/features/studio-cabinet/reviews/server/reviews-stats.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  filter?: string;
  master?: string;
  cursor?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

export default async function StudioReviewsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const filter = isStudioReviewFilter(params?.filter) ? params!.filter : "all";
  const masterId = params?.master?.trim() ?? "all";
  const cursor = params?.cursor?.trim() || undefined;

  const [data, stats] = await Promise.all([
    loadStudioReviewsList({
      studioId,
      currentUserId: user.id,
      filter,
      masterId,
      cursor,
    }),
    loadStudioReviewsStats(studioId),
  ]);

  return (
    <StudioReviewsPage data={data} stats={stats} filter={filter} masterId={masterId} />
  );
}
