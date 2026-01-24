import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingStatus } from "@prisma/client";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { serverApiFetch } from "@/lib/api/server-fetch";

export default async function StudioPage() {
  const providerResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me"
  );

  if (!providerResponse.ok) {
    if (providerResponse.error.code === "UNAUTHORIZED") redirect("/login");
    if (providerResponse.error.code === "FORBIDDEN_ROLE") redirect("/403");
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">??????? ??????</h1>
        <p className="mt-2 text-neutral-600">?????? ????????: {providerResponse.error.message}</p>
      </div>
    );
  }

  const provider = providerResponse.data.provider;

  if (!provider) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">??????? ??????</h1>
        <p className="mt-2 text-neutral-600">
          ? ??? ???? ??? ??????? ??????. ???????? ???, ????? ???????? ??????.
        </p>

        <form action={createMyStudioProviderAction} className="mt-6">
          <button className="rounded-xl bg-black text-white px-4 py-2 font-medium">
            ??????? ??????? ??????
          </button>
        </form>
      </div>
    );
  }

  const bookingsResponse = await serverApiFetch<{
    bookings: Array<{
      id: string;
      slotLabel: string;
      clientName: string;
      clientPhone: string;
      comment: string | null;
      status: BookingStatus;
      service: { name: string };
    }>;
  }>(`/api/bookings?providerId=${provider.id}`);

  const bookingsError = bookingsResponse.ok ? null : bookingsResponse.error.message;
  const bookings = bookingsResponse.ok ? bookingsResponse.data.bookings : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">??????? ??????</h1>
          <div className="mt-2 text-neutral-700">
            <div className="font-medium">{provider.name}</div>
            <div className="text-sm text-neutral-600">{provider.tagline}</div>
          </div>
        </div>

        <Link
          href={`/providers/${provider.id}`}
          className="rounded-xl border px-4 py-2 font-medium hover:bg-neutral-50"
        >
          ??????? ????????? ???????
        </Link>
      </div>

      <section className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">??????</h2>

        {bookingsError ? (
          <p className="mt-3 text-sm text-red-600">?????? ????????: {bookingsError}</p>
        ) : bookings.length === 0 ? (
          <p className="mt-3 text-neutral-600">???? ??? ???????.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{b.clientName}</div>
                  <div className="text-sm text-neutral-600">{b.status}</div>
                </div>
                <div className="mt-1 text-sm text-neutral-700">
                  {b.slotLabel} ? {b.service.name} ? {b.clientPhone}
                </div>
                {b.comment ? (
                  <div className="mt-2 text-sm text-neutral-600">{b.comment}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function createMyStudioProviderAction() {
  "use server";
  const response = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me",
    { method: "POST" }
  );

  if (!response.ok) {
    if (response.error.code === "UNAUTHORIZED") redirect("/login");
    if (response.error.code === "FORBIDDEN_ROLE") redirect("/403");
  }

  redirect("/studio");
}
