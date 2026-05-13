import { FocalImage } from "@/components/ui/focal-image";
import type { AdminPanelRole, AdminPanelUser } from "@/features/admin-cabinet/types";
import { UI_TEXT } from "@/lib/ui/text";

type Props = Pick<AdminPanelUser, "name" | "avatarUrl" | "role">;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

const ROLE_LABEL: Record<AdminPanelRole, string> = {
  SUPERADMIN: UI_TEXT.adminPanel.role.superadmin,
  ADMIN: UI_TEXT.adminPanel.role.admin,
};

/**
 * Quiet card at the bottom of the admin sidebar. Compact avatar + name
 * + monospaced role caption. Receives only plain props so it can stay a
 * server component — no hover behaviour because the chip isn't a link
 * (admin profile editing happens through the user's regular cabinet,
 * not the admin panel).
 */
export function AdminUserChip({ name, avatarUrl, role }: Props) {
  return (
    <div className="mx-3 mb-3 mt-4 flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card px-3 py-2.5 shadow-card">
      {avatarUrl ? (
        <FocalImage
          src={avatarUrl}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-semibold text-white ring-1 ring-border-subtle"
        >
          {initialsOf(name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-main">{name}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-sec">
          {ROLE_LABEL[role]}
        </p>
      </div>
    </div>
  );
}
