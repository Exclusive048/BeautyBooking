import { redirect } from "next/navigation";
import { StudioClientsPage } from "@/features/studio-cabinet/clients/components/studio-clients-page";
import { loadStudioClientsData } from "@/features/studio-cabinet/clients/server/clients-data.service";
import { isStudioClientSegmentKey } from "@/features/studio-cabinet/clients/lib/types";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  segment?: string;
  q?: string;
  master?: string;
  cursor?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

export default async function StudioClientsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const segment = isStudioClientSegmentKey(params?.segment) ? params!.segment : "all";
  const search = params?.q?.trim() ?? "";
  const masterId = params?.master?.trim() ?? "all";
  const cursor = params?.cursor?.trim() || undefined;

  const data = await loadStudioClientsData({
    studioId,
    segment,
    search,
    masterId,
    cursor,
  });

  return (
    <StudioClientsPage data={data} segment={segment} search={search} masterId={masterId} />
  );
}
