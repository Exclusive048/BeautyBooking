"use client";

import { useParams, useSearchParams } from "next/navigation";
import { StudioBookingFlow } from "@/features/public-studio/studio-booking-flow/booking-flow";

export default function StudioBookingClient() {
  const params = useParams<{ studioId: string }>();
  const searchParams = useSearchParams();
  const studioId = params?.studioId ?? "";
  const initialMasterId = searchParams.get("masterId") ?? undefined;
  const initialServiceId = searchParams.get("serviceId") ?? undefined;

  if (!studioId) return null;

  return (
    <StudioBookingFlow
      studioId={studioId}
      initialMasterId={initialMasterId}
      initialServiceId={initialServiceId}
    />
  );
}
