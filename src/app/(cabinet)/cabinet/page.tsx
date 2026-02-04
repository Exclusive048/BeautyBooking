import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { MASTER_CABINET_PATH, STUDIO_CABINET_PATH } from "@/lib/auth/cabinet-paths";
import { getSessionUser } from "@/lib/auth/session";

export default async function CabinetEntryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const decision = await resolveCabinetRedirect(user.id);
  if (!decision.needsHub) {
    redirect(decision.target);
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">My cabinet</h1>
        <p className="text-sm text-neutral-600">Choose mode to continue.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {decision.hasStudioMode ? (
          <Link
            href={STUDIO_CABINET_PATH}
            className="rounded-2xl border p-5 transition hover:bg-neutral-50"
          >
            <div className="text-lg font-semibold">Studio</div>
            <div className="mt-1 text-sm text-neutral-600">
              Calendar, services, team and studio management.
            </div>
          </Link>
        ) : null}

        {decision.hasMasterMode ? (
          <Link
            href={MASTER_CABINET_PATH}
            className="rounded-2xl border p-5 transition hover:bg-neutral-50"
          >
            <div className="text-lg font-semibold">Master</div>
            <div className="mt-1 text-sm text-neutral-600">
              Day plan, schedule and storefront profile.
            </div>
          </Link>
        ) : null}

      </div>
    </section>
  );
}
