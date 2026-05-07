import { MasterSchedulePage } from "@/features/master/components/schedule/master-schedule-page";

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

export default async function MasterScheduleRoute({ searchParams }: RouteProps) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  return (
    <MasterSchedulePage
      searchParams={{
        weekStart: pickString(params.weekStart),
      }}
    />
  );
}
