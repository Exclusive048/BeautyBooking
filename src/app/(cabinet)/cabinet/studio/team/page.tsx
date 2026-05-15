import { redirect } from "next/navigation";
import { StudioMastersPage } from "@/features/studio-cabinet/masters/components/studio-masters-page";
import { loadStudioMastersList } from "@/features/studio-cabinet/masters/server/masters-list.service";
import { loadStudioMasterDetail } from "@/features/studio-cabinet/masters/server/master-detail.service";
import {
  isStudioMasterFilter,
  type StudioMasterFilter,
} from "@/features/studio-cabinet/masters/server/types";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  tab?: string;
  q?: string;
  master?: string;
  /** Legacy `?filter=working_today` from the old team page — quietly
   * collapsed to `all` so external links keep landing on the page. */
  filter?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

export default async function StudioTeamRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const tab = params?.tab;
  const filter: StudioMasterFilter = isStudioMasterFilter(tab) ? tab : "all";
  const search = params?.q?.trim() ?? "";
  const selectedMasterId = params?.master ?? null;

  const list = await loadStudioMastersList({
    studioId,
    currentUserId: user.id,
    filter,
    search,
  });

  const detail = selectedMasterId
    ? await loadStudioMasterDetail({
        studioId,
        masterId: selectedMasterId,
        currentUserId: user.id,
      })
    : null;

  return (
    <StudioMastersPage
      studioId={studioId}
      filter={filter}
      search={search}
      selectedMasterId={detail ? selectedMasterId : null}
      list={list}
      detail={detail}
    />
  );
}
