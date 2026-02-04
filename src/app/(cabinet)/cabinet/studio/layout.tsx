import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { CabinetSideNav, type CabinetNavItem } from "@/features/cabinet/components/cabinet-side-nav";

const STUDIO_NAV: CabinetNavItem[] = [
  { href: "/cabinet/studio/calendar", label: "Calendar" },
  { href: "/cabinet/studio/services", label: "Services" },
  { href: "/cabinet/studio/team", label: "Team" },
  { href: "/cabinet/studio/clients", label: "Clients" },
  { href: "/cabinet/studio/finance", label: "Finance" },
];

export default async function StudioCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasAccess = await hasStudioAdminAccess(user.id);
  if (!hasAccess) redirect("/403");

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:flex-row">
      <aside className="md:w-64 md:shrink-0">
        <div className="rounded-2xl border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold">Studio cabinet</h1>
            <Link
              href="/cabinet/studio/profile"
              className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
            >
              Profile
            </Link>
          </div>
          <CabinetSideNav items={STUDIO_NAV} />
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </section>
  );
}
