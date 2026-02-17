import { PublicStudioProfilePage } from "@/features/public-studio/public-studio-profile-page";

type Props = {
  params: { studioId: string };
};

export default function StudioProfilePage({ params }: Props) {
  return <PublicStudioProfilePage studioId={params.studioId} />;
}
