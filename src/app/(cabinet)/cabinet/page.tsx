import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAnyStudioAccess } from "@/lib/auth/studio-guards";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";

export default async function CabinetEntryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [hasStudioMode, hasMasterMode] = await Promise.all([
    hasAnyStudioAccess(user.id),
    hasMasterProfile(user.id),
  ]);

  return (
    <section className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">My cabinet</h1>
        <p className="text-sm text-neutral-600">Choose mode to continue.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {hasStudioMode ? (
          <Link
            href="/cabinet/studio/calendar"
            className="rounded-2xl border p-5 transition hover:bg-neutral-50"
          >
            <div className="text-lg font-semibold">Studio</div>
            <div className="mt-1 text-sm text-neutral-600">
              Calendar, services, team and studio management.
            </div>
          </Link>
        ) : null}

        {hasMasterMode ? (
          <Link
            href="/cabinet/master/dashboard"
            className="rounded-2xl border p-5 transition hover:bg-neutral-50"
          >
            <div className="text-lg font-semibold">Master</div>
            <div className="mt-1 text-sm text-neutral-600">
              Day plan, schedule and storefront profile.
            </div>
          </Link>
        ) : null}

        <Link
          href="/cabinet/client/bookings"
          className="rounded-2xl border p-5 transition hover:bg-neutral-50"
        >
          <div className="text-lg font-semibold">Client</div>
          <div className="mt-1 text-sm text-neutral-600">
            My bookings, profile and personal settings.
          </div>
        </Link>
      </div>
    </section>
  );
}
