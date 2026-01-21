"use client";

import { Section } from "@/components/ui/section";
import { BookingsList } from "@/features/booking/components/bookings-list";
import { Badge } from "@/components/ui/badge";

const STUDIO_PROVIDER_ID = "p2"; // MVP: позже привяжем к аккаунту

export default function StudioCabinetPage() {
  return (
    <div className="space-y-6">
      <Section
        title="Кабинет студии"
        subtitle="Записи по этому филиалу."
        right={<Badge>providerId: {STUDIO_PROVIDER_ID}</Badge>}
      />
      <BookingsList providerId={STUDIO_PROVIDER_ID} />
    </div>
  );
}
