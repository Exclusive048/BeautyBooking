"use client";

import Link from "next/link";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { PublicBookingWidget } from "@/features/public-profile/master/public-booking-widget";
import { useSelectedServices } from "@/features/public-profile/master/selected-services-context";
import { UI_TEXT } from "@/lib/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { studioBookingUrl } from "@/lib/public-urls";

type Props = {
  provider: ProviderProfileDto;
  initialSlotStartAt: string | null;
  studioPublicUsername: string | null;
};

export function BookingSectionClient({ provider, initialSlotStartAt, studioPublicUsername }: Props) {
  const { selectedServices, removeService } = useSelectedServices();

  const masterKey = provider.publicUsername?.trim() || "";

  const studioBookingHref =
    provider.type === "MASTER" && provider.studioId
      ? studioBookingUrl(
          { id: provider.studioId, publicUsername: studioPublicUsername },
          {
            master: masterKey || undefined,
            masterId: masterKey ? undefined : provider.id,
            serviceId: selectedServices[0]?.id,
          },
          "master-studio-booking"
        )
      : null;

  if (studioBookingHref) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="text-sm font-semibold text-text-main">{UI_TEXT.publicProfile.page.studioBookingTitle}</div>
          <div className="text-sm text-text-sec">{UI_TEXT.publicProfile.page.studioBookingDescription}</div>
          <Link
            href={studioBookingHref}
            className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover"
          >
            {UI_TEXT.publicProfile.page.studioBookingCta}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <PublicBookingWidget
      providerId={provider.id}
      providerTimezone={provider.timezone}
      selectedServices={selectedServices}
      initialSlotStartAt={initialSlotStartAt}
      onRemove={removeService}
    />
  );
}
