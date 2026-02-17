import { PublicMasterProfilePage } from "@/features/public-profile/master/public-profile-page";

type Props = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ProviderProfilePage({ params, searchParams }: Props) {
  const initialServiceId =
    typeof searchParams?.serviceId === "string" ? searchParams?.serviceId : null;
  const initialSlotStartAt =
    typeof searchParams?.slotStartAt === "string" ? searchParams?.slotStartAt : null;

  return (
    <PublicMasterProfilePage
      providerId={params.id}
      initialServiceId={initialServiceId}
      initialSlotStartAt={initialSlotStartAt}
    />
  );
}
