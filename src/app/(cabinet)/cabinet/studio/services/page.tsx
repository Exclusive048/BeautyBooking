import { redirect } from "next/navigation";
import { StudioServicesPage } from "@/features/studio-cabinet/services/components/studio-services-page";
import {
  listAvailableCategoriesForStudio,
  loadStudioServiceDetail,
  loadStudioServicesKpis,
  loadStudioServicesListData,
} from "@/features/studio-cabinet/services/server/services-data.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  category?: string;
  service?: string;
  q?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

export default async function StudioServicesRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const categoryId = params?.category ?? null;
  const serviceId = params?.service ?? null;
  const search = params?.q?.trim() ?? "";

  const [listData, kpis, pickerOptions] = await Promise.all([
    loadStudioServicesListData({
      studioId,
      currentUserId: user.id,
      categoryId,
      search,
    }),
    loadStudioServicesKpis(studioId),
    listAvailableCategoriesForStudio(user.id),
  ]);

  const detail = serviceId
    ? await loadStudioServiceDetail({ studioId, serviceId })
    : null;

  return (
    <StudioServicesPage
      studioId={studioId}
      categories={listData.categories}
      pickerOptions={pickerOptions}
      selectedCategoryId={listData.selectedCategoryId}
      items={listData.items}
      search={search}
      detail={detail}
      kpis={kpis}
    />
  );
}
