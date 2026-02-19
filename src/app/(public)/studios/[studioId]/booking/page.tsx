import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withQuery } from "@/lib/public-urls";
import StudioBookingClient from "./booking-client";

type Props = {
  params: { studioId: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function StudioBookingPage({ params, searchParams }: Props) {
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const provider = await prisma.provider.findUnique({
    where: { id: params.studioId },
    select: { id: true, publicUsername: true, isPublished: true, type: true },
  });

  if (!provider) {
    notFound();
  }

  if (provider.publicUsername && provider.isPublished) {
    const redirectUrl = withQuery(`/u/${provider.publicUsername}/booking`, {
      masterId: typeof sp.masterId === "string" ? sp.masterId : undefined,
      serviceId: typeof sp.serviceId === "string" ? sp.serviceId : undefined,
    });
    permanentRedirect(redirectUrl);
  }

  if (provider.type !== "STUDIO") {
    if (provider.publicUsername && provider.isPublished) {
      permanentRedirect(`/u/${provider.publicUsername}`);
    }
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <StudioBookingClient />
    </Suspense>
  );
}
