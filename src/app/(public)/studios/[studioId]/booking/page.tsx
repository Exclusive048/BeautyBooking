import { Suspense } from "react";
import StudioBookingClient from "./booking-client";

export default function StudioBookingPage() {
  return (
    <Suspense fallback={null}>
      <StudioBookingClient />
    </Suspense>
  );
}
