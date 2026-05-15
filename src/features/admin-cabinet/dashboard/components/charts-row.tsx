import { BookingsChart } from "@/features/admin-cabinet/dashboard/components/bookings-chart";
import { RegistrationsChart } from "@/features/admin-cabinet/dashboard/components/registrations-chart";
import type { AdminCharts } from "@/features/admin-cabinet/dashboard/types";

type Props = {
  data: AdminCharts;
};

/** Two-up at desktop, stacked at mobile. The reference uses a 1.4:1
 * width ratio for "registrations : bookings"; mirrored here through
 * `lg:grid-cols-[1.4fr_1fr]`. */
export function ChartsRow({ data }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr] lg:gap-4">
      <RegistrationsChart data={data.registrations} />
      <BookingsChart data={data.bookings} />
    </div>
  );
}
