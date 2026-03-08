import { notFound, permanentRedirect } from "next/navigation";
import { withQuery } from "@/lib/public-urls";
import { PublicMasterProfilePage } from "@/features/public-profile/master/public-profile-page";
import { PublicStudioProfilePage } from "@/features/public-studio/public-studio-profile-page";
import { SelectedServicesProvider } from "@/features/public-profile/master/selected-services-context";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function ProviderProfilePage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const provider = await resolveProviderBySlugOrId({
    key: resolvedParams.id,
    select: { id: true, publicUsername: true, isPublished: true, type: true },
  });

  if (!provider) {
    notFound();
  }

  if (provider.publicUsername && provider.isPublished) {
    const master = typeof sp.master === "string" ? sp.master : undefined;
    const legacyMasterId = typeof sp.masterId === "string" ? sp.masterId : undefined;
    const redirectUrl = withQuery(`/u/${provider.publicUsername}`, {
      serviceId: typeof sp.serviceId === "string" ? sp.serviceId : undefined,
      slotStartAt: typeof sp.slotStartAt === "string" ? sp.slotStartAt : undefined,
      master: master,
      masterId: master ? undefined : legacyMasterId,
    });
    permanentRedirect(redirectUrl);
  }

  const bookingParams = {
    serviceId: typeof sp.serviceId === "string" ? sp.serviceId : undefined,
    master: typeof sp.master === "string" ? sp.master : undefined,
    masterId: typeof sp.master === "string" ? undefined : typeof sp.masterId === "string" ? sp.masterId : undefined,
    slotStartAt: typeof sp.slotStartAt === "string" ? sp.slotStartAt : undefined,
  };

  if (provider.type === "STUDIO") {
    return <PublicStudioProfilePage studioId={provider.id} bookingParams={bookingParams} />;
  }

  const initialServiceId = typeof sp.serviceId === "string" ? sp.serviceId : null;
  const initialSlotStartAt = typeof sp.slotStartAt === "string" ? sp.slotStartAt : null;

  return (
    <SelectedServicesProvider>
      <PublicMasterProfilePage
        providerId={provider.id}
        initialServiceId={initialServiceId}
        initialSlotStartAt={initialSlotStartAt}
      />
    </SelectedServicesProvider>
  );
}
