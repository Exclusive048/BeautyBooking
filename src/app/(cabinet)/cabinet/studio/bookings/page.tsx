import { BookingStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { StudioBookingsPage } from "@/features/studio-cabinet/bookings/components/studio-bookings-page";
import {
  parseBookingsTimeRange,
  type BookingsTimeRange,
} from "@/features/studio-cabinet/bookings/lib/time-range-filter";
import { listStudioBookings } from "@/features/studio-cabinet/bookings/server/bookings-list.service";
import {
  loadStudioBookingsKpis,
  loadStudioMasterOptions,
} from "@/features/studio-cabinet/bookings/server/bookings-kpis.service";
import { loadStudioCabinetShellExtras } from "@/features/studio-cabinet/schedule/server/shell-extras.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  range?: string;
  status?: string;
  master?: string;
  q?: string;
  cursor?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

function parseStatus(value: string | undefined): BookingStatus | "all" {
  if (!value || value === "all") return "all";
  return (Object.values(BookingStatus) as string[]).includes(value)
    ? (value as BookingStatus)
    : "all";
}

// STUDIO-CLIENT-WRITE-DIALOG-A: the inline `loadShellExtras` here was
// extracted to `shell-extras.service.ts` so the clients page can reuse
// the same shape (CreateBookingDialog needs `scheduleMasters[]` +
// `services[]` with master-services join). Single source of truth.

export default async function StudioBookingsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const range: BookingsTimeRange = parseBookingsTimeRange(params?.range);
  const status = parseStatus(params?.status);
  const masterId = params?.master ?? "all";
  const search = params?.q?.trim() ?? "";
  const cursor = params?.cursor ?? null;

  const [list, kpis, masterOptions, shellExtras] = await Promise.all([
    listStudioBookings({
      studioId,
      filters: { range, status, masterId, search },
      cursor,
    }),
    loadStudioBookingsKpis(studioId),
    loadStudioMasterOptions(studioId),
    loadStudioCabinetShellExtras(studioId),
  ]);

  return (
    <StudioBookingsPage
      studioId={studioId}
      range={range}
      status={status}
      masterId={masterId}
      search={search}
      list={list}
      kpis={kpis}
      masterOptions={masterOptions}
      scheduleMasters={shellExtras.scheduleMasters}
      services={shellExtras.services}
    />
  );
}
