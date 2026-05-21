import { BookingStatus, ProviderType } from "@prisma/client";
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
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
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

async function loadShellExtras(studioId: string): Promise<{
  scheduleMasters: ScheduleMasterColumn[];
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceKopeks: number;
    masterIds: string[];
  }>;
}> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) return { scheduleMasters: [], services: [] };

  const [masters, services, masterServices] = await Promise.all([
    prisma.provider.findMany({
      where: { type: ProviderType.MASTER, studioId: studio.providerId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        isPublished: true,
        ownerUserId: true,
        ratingAvg: true,
        ratingCount: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { studioId, isEnabled: true },
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.masterService.findMany({
      where: {
        isEnabled: true,
        masterProvider: { type: ProviderType.MASTER, studioId: studio.providerId },
      },
      select: { masterProviderId: true, serviceId: true },
    }),
  ]);

  const mastersByService = new Map<string, string[]>();
  // STUDIO-RESCHEDULE-VALIDATION-A: invert the same join so each
  // master row in `scheduleMasters` can carry its `serviceIds[]`. The
  // move-booking dialog's master picker reads this to mark
  // incompatible masters disabled.
  const servicesByMaster = new Map<string, string[]>();
  for (const link of masterServices) {
    const arr = mastersByService.get(link.serviceId) ?? [];
    arr.push(link.masterProviderId);
    mastersByService.set(link.serviceId, arr);

    const services = servicesByMaster.get(link.masterProviderId) ?? [];
    services.push(link.serviceId);
    servicesByMaster.set(link.masterProviderId, services);
  }

  // STUDIO-BUGS-FIX-A bug #5: scheduleMasters reuse drives the
  // CreateBookingDialog / MoveBookingDialog master pickers — keep
  // isAvailable aligned with the schedule grid's eligibility predicate.
  return {
    scheduleMasters: masters.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      rating: m.ratingAvg ?? 0,
      reviewsCount: m.ratingCount ?? 0,
      isAvailable: isStudioMasterActive(m),
      serviceIds: servicesByMaster.get(m.id) ?? [],
    })),
    services: services.map((s) => ({
      id: s.id,
      name: s.title?.trim() || s.name,
      durationMin: s.durationMin,
      priceKopeks: s.price,
      masterIds: mastersByService.get(s.id) ?? [],
    })),
  };
}

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
    loadShellExtras(studioId),
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
