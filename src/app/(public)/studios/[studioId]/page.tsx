import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicStudioProfilePage } from "@/features/public-studio/public-studio-profile-page";

type Props = {
  params: { studioId: string };
};

export default async function StudioProfilePage({ params }: Props) {
  const provider = await prisma.provider.findUnique({
    where: { id: params.studioId },
    select: { id: true, publicUsername: true, isPublished: true, type: true },
  });

  if (!provider) {
    notFound();
  }

  if (provider.publicUsername && provider.isPublished) {
    permanentRedirect(`/u/${provider.publicUsername}`);
  }

  if (provider.type !== "STUDIO") {
    if (provider.publicUsername && provider.isPublished) {
      permanentRedirect(`/u/${provider.publicUsername}`);
    }
    notFound();
  }

  return <PublicStudioProfilePage studioId={provider.id} />;
}
