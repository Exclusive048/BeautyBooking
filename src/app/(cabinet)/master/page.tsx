"use client";

import { Section } from "@/components/ui/section";
import { BookingsList } from "@/features/booking/components/bookings-list";
import { Badge } from "@/components/ui/badge";

const MASTER_PROVIDER_ID = "p1"; // MVP: позже привяжем к аккаунту

export default function MasterCabinetPage() {
  return (
    <div className="space-y-6">
      <Section
        title="Кабинет мастера"
        subtitle="Записи из базы данных (Supabase)."
        right={<Badge>providerId: {MASTER_PROVIDER_ID}</Badge>}
      />
      <BookingsList providerId={MASTER_PROVIDER_ID} />
    </div>
  );
}
