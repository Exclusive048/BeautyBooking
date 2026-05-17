import { redirect } from "next/navigation";
import { StudioNotificationsPage } from "@/features/studio-cabinet/notifications/components/studio-notifications-page";
import {
  loadStudioNotificationsData,
  parseStudioChip,
  parseStudioSort,
} from "@/features/studio-cabinet/notifications/server/notifications-data.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  chip?: string;
  sort?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

export default async function StudioNotificationsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  try {
    await resolveCurrentStudioAccess(user.id);
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const activeChip = parseStudioChip(params?.chip);
  const sort = parseStudioSort(params?.sort);

  const data = await loadStudioNotificationsData({
    userId: user.id,
    phone: user.phone ?? null,
    activeChip,
    sort,
  });

  return <StudioNotificationsPage data={data} />;
}
