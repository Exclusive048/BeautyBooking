import { MasterBookingsPage } from "@/features/master/components/bookings/master-bookings-page";

export const runtime = "nodejs";

type RouteProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function MasterBookingsRoute({ searchParams }: RouteProps) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  return (
    <MasterBookingsPage
      searchParams={{
        q: pickString(params.q),
        tab: pickString(params.tab),
      }}
    />
  );
}
