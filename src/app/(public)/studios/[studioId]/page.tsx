import { PublicStudioProfileClient } from "@/features/public-studio/public-studio-profile-client";

type Props = {
  params: { studioId: string };
};

export default function StudioProfilePage({ params }: Props) {
  return <PublicStudioProfileClient studioId={params.studioId} />;
}
