import { PublicMasterProfileClient } from "@/features/public-profile/master/public-profile-client";

type Props = {
  params: { id: string };
};

export default function ProviderProfilePage({ params }: Props) {
  return <PublicMasterProfileClient providerId={params.id} />;
}
