import {
  MasterBookingsPage,
  type MasterBookingsSearchParams,
} from "@/features/master/components/bookings/master-bookings-page";

export const runtime = "nodejs";

type RouteProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const KEYS = ["date", "view", "q", "upcoming", "limit", "status", "client", "focus"] as const;

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function MasterBookingsRoute({ searchParams }: RouteProps) {
  const params = (await searchParams) ?? {};
  const picked: MasterBookingsSearchParams = {};
  for (const key of KEYS) {
    const value = pickString(params[key]);
    if (value) picked[key] = value;
  }
  // MASTER-CLIENTS-FIX-A #7а: `client` — HMAC-токен из «Вся история» карточки
  // клиента; проверяется против текущего мастера на странице.
  return <MasterBookingsPage searchParams={picked} />;
}
