import Link from "next/link";
import { ArrowRight, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.account;

type Props = {
  roles: string[];
};

const LABEL_BY_ROLE: Record<string, string> = {
  CLIENT: T.roleClient,
  MASTER: T.roleMaster,
  STUDIO: T.roleStudio,
  STUDIO_ADMIN: T.roleStudioAdmin,
  ADMIN: T.roleAdmin,
  SUPERADMIN: T.roleSuperadmin,
};

export function RolesCard({ roles }: Props) {
  const labels = roles
    .map((role) => LABEL_BY_ROLE[role] ?? role)
    .filter((label, index, arr) => arr.indexOf(label) === index);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-base text-text-main">{T.rolesHeading}</h2>
      <div className="mt-4 flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-input text-text-sec">
          <IdCard className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.rolesActiveLabel}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <li
                key={label}
                className="inline-flex items-center rounded-full border border-border-subtle bg-bg-input px-2.5 py-0.5 text-xs text-text-main"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/cabinet/roles" className="gap-1.5">
            {T.manageRolesCta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
